import { Kysely, sql } from 'kysely'

/**
 * Cleans up the catalog damage caused by the first-start seeding race (the
 * seed ran several times concurrently on an empty database) and drops the
 * legacy "IA para DevOps" roadmap, superseded by "Roadmap IA para SRE/DevOps -
 * Versión 2.0".
 *
 * Safe by construction (this runs against real data, e.g. Supabase):
 *  - Only EXACT duplicates are candidates: same title and identical content
 *    (every column but id/published_at, plus topics and the ordered content of
 *    their modules), or modules with the same roadmap_id, position and
 *    identical content. The lowest id is always kept.
 *  - A duplicate is deleted only when nothing refers to it: no learner data
 *    (attempts, progress, access grants, evidences, quiz sessions) and no
 *    lessons on its modules. Anything else is kept and reported with
 *    console.warn so an admin can review it.
 *  - Idempotent: once clean, every step finds nothing to do.
 *
 * Deleting a roadmap cascades to its modules and roadmap_topics (FKs from
 * 0001). `down` is a no-op: removed rows cannot be restored.
 */

const LEGACY_ROADMAP_TITLE = 'IA para DevOps'

type Row = Record<string, unknown>

function ids(rows: Array<{ id: number }>): number[] {
  return rows.map((row) => Number(row.id))
}

function idList(values: number[]) {
  return sql.join(values.map((value) => sql`${value}`))
}

async function count(query: Promise<{ rows: Array<{ n: number | string }> }>): Promise<number> {
  const { rows } = await query
  return Number(rows[0]?.n ?? 0)
}

/** True when any learner data or lessons hang off these modules. */
async function modulesAreReferenced(db: Kysely<any>, moduleIds: number[]): Promise<boolean> {
  if (moduleIds.length === 0) return false
  const list = idList(moduleIds)
  const checks = await Promise.all([
    count(sql<{ n: number }>`SELECT COUNT(*) AS n FROM lessons WHERE module_id IN (${list})`.execute(db)),
    count(sql<{ n: number }>`SELECT COUNT(*) AS n FROM user_module_evidences WHERE module_id IN (${list})`.execute(db)),
    count(sql<{ n: number }>`SELECT COUNT(*) AS n FROM user_quiz_attempts WHERE module_id IN (${list})`.execute(db)),
    count(sql<{ n: number }>`SELECT COUNT(*) AS n FROM quiz_attempt_sessions WHERE module_id IN (${list})`.execute(db)),
    count(sql<{ n: number }>`SELECT COUNT(*) AS n FROM user_roadmap_progress WHERE current_module_id IN (${list})`.execute(db))
  ])
  return checks.some((n) => n > 0)
}

/** True when the roadmap, or any of its modules, is referenced by user data. */
async function roadmapIsReferenced(db: Kysely<any>, roadmapId: number): Promise<boolean> {
  const checks = await Promise.all([
    count(sql<{ n: number }>`SELECT COUNT(*) AS n FROM user_quiz_attempts WHERE roadmap_id = ${roadmapId}`.execute(db)),
    count(sql<{ n: number }>`SELECT COUNT(*) AS n FROM user_roadmap_progress WHERE roadmap_id = ${roadmapId}`.execute(db)),
    count(sql<{ n: number }>`SELECT COUNT(*) AS n FROM user_roadmap_access WHERE roadmap_id = ${roadmapId}`.execute(db))
  ])
  if (checks.some((n) => n > 0)) return true

  const moduleIds = ids((await sql<{ id: number }>`SELECT id FROM modules WHERE roadmap_id = ${roadmapId}`.execute(db)).rows)
  return modulesAreReferenced(db, moduleIds)
}

function withoutKeys(row: Row, keys: string[]): Row {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)))
}

async function roadmapSignature(db: Kysely<any>, roadmap: Row): Promise<string> {
  const roadmapId = Number(roadmap.id)
  const modules = (await sql<Row>`
    SELECT * FROM modules WHERE roadmap_id = ${roadmapId} ORDER BY position, id
  `.execute(db)).rows
  const topics = (await sql<{ topic_id: number }>`
    SELECT topic_id FROM roadmap_topics WHERE roadmap_id = ${roadmapId} ORDER BY topic_id
  `.execute(db)).rows
  return JSON.stringify({
    roadmap: withoutKeys(roadmap, ['id', 'published_at']),
    topics: topics.map((row) => row.topic_id),
    modules: modules.map((row) => withoutKeys(row, ['id', 'roadmap_id']))
  })
}

async function dedupeRoadmaps(db: Kysely<any>) {
  const roadmaps = (await sql<Row>`SELECT * FROM roadmaps ORDER BY id`.execute(db)).rows
  const byTitle = new Map<string, Row[]>()
  for (const roadmap of roadmaps) {
    const title = String(roadmap.title)
    byTitle.set(title, [...(byTitle.get(title) ?? []), roadmap])
  }

  for (const [title, group] of byTitle) {
    if (group.length < 2) continue
    const signatures = new Map<string, number[]>()
    for (const roadmap of group) {
      const signature = await roadmapSignature(db, roadmap)
      signatures.set(signature, [...(signatures.get(signature) ?? []), Number(roadmap.id)])
    }

    for (const sameContent of signatures.values()) {
      const [keep, ...duplicates] = sameContent
      for (const duplicateId of duplicates) {
        if (await roadmapIsReferenced(db, duplicateId)) {
          console.warn(
            `[0003] Roadmap ${duplicateId} ("${title}") duplicates roadmap ${keep} but has user data or lessons: kept.`
          )
          continue
        }
        await sql`DELETE FROM roadmaps WHERE id = ${duplicateId}`.execute(db)
      }
    }
  }
}

async function dedupeModules(db: Kysely<any>) {
  const modules = (await sql<Row>`SELECT * FROM modules ORDER BY roadmap_id, position, id`.execute(db)).rows
  const groups = new Map<string, number[]>()
  for (const row of modules) {
    // position is part of the identity; keep it (and roadmap_id) in the key.
    const key = JSON.stringify([row.roadmap_id, row.position, withoutKeys(row, ['id'])])
    groups.set(key, [...(groups.get(key) ?? []), Number(row.id)])
  }

  for (const sameContent of groups.values()) {
    const [keep, ...duplicates] = sameContent
    for (const duplicateId of duplicates) {
      if (await modulesAreReferenced(db, [duplicateId])) {
        console.warn(`[0003] Module ${duplicateId} duplicates module ${keep} but is referenced: kept.`)
        continue
      }
      await sql`DELETE FROM modules WHERE id = ${duplicateId}`.execute(db)
    }
  }
}

async function dropLegacyRoadmap(db: Kysely<any>) {
  const legacy = (await sql<{ id: number }>`
    SELECT id FROM roadmaps WHERE title = ${LEGACY_ROADMAP_TITLE} ORDER BY id
  `.execute(db)).rows
  for (const { id } of legacy) {
    if (await roadmapIsReferenced(db, Number(id))) {
      console.warn(`[0003] Legacy roadmap ${id} ("${LEGACY_ROADMAP_TITLE}") has user data: kept.`)
      continue
    }
    await sql`DELETE FROM roadmaps WHERE id = ${Number(id)}`.execute(db)
  }
}

export async function up(db: Kysely<any>): Promise<void> {
  // Modules first: a race clone that also got duplicated modules inside it
  // only compares equal to its twin once those are collapsed.
  await dedupeModules(db)
  await dedupeRoadmaps(db)
  await dropLegacyRoadmap(db)
}

export async function down(_db: Kysely<any>): Promise<void> {
  // Intentionally a no-op: deleted duplicate rows cannot be reconstructed.
}
