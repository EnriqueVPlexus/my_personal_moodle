import { Selectable } from 'kysely'
import type { DatabaseClient } from './persistence/database'
import type { PostgresDb } from './persistence/postgresDb'
import { getQueryDatabase, UserModuleEvidencesTable } from './persistence/kyselyDatabase'
import { EvidenceReviewStatus, EvidenceType, EVIDENCE_REVIEW_STATUSES, ModuleEvidence } from './evidences'

export type EvidenceRow = Selectable<UserModuleEvidencesTable>

function pool(db: DatabaseClient) {
  return (db as PostgresDb).getPool()
}

const SELECT_COLUMNS = `id, user_id, module_id, evidence_type, url, note,
            COALESCE(review_status, 'pendiente') AS review_status,
            admin_comment, reviewed_at, reviewed_by_user_id, created_at, updated_at`

export async function getModuleEvidence(db: DatabaseClient, userId: number, moduleId: number): Promise<ModuleEvidence | null> {
  if (db.backend !== 'postgres') {
    const row = await db.get<ModuleEvidence>(
      `SELECT ${SELECT_COLUMNS}
       FROM user_module_evidences
       WHERE user_id = ? AND module_id = ?`,
      [userId, moduleId]
    )
    return row || null
  }

  const row = await getQueryDatabase(pool(db))
    .selectFrom('user_module_evidences')
    .select([
      'id', 'user_id', 'module_id', 'evidence_type', 'url', 'note',
      'review_status', 'admin_comment', 'reviewed_at', 'reviewed_by_user_id',
      'created_at', 'updated_at'
    ])
    .where('user_id', '=', userId)
    .where('module_id', '=', moduleId)
    .executeTakeFirst()

  if (!row) return null
  return { ...row, review_status: row.review_status ?? 'pendiente' } as unknown as ModuleEvidence
}

export async function saveModuleEvidence(
  db: DatabaseClient,
  userId: number,
  moduleId: number,
  input: { evidenceType: EvidenceType; url: string | null; note: string | null }
): Promise<ModuleEvidence> {
  const now = new Date().toISOString()

  if (db.backend !== 'postgres') {
    await db.run(
      `INSERT INTO user_module_evidences (
         user_id, module_id, evidence_type, url, note, review_status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'pendiente', ?, ?)
       ON CONFLICT(user_id, module_id) DO UPDATE SET
         evidence_type = excluded.evidence_type,
         url = excluded.url,
         note = excluded.note,
         review_status = 'pendiente',
         updated_at = excluded.updated_at`,
      [userId, moduleId, input.evidenceType, input.url, input.note, now, now]
    )
  } else {
    await getQueryDatabase(pool(db))
      .insertInto('user_module_evidences')
      .values({
        user_id: userId,
        module_id: moduleId,
        evidence_type: input.evidenceType,
        url: input.url,
        note: input.note,
        review_status: 'pendiente',
        created_at: now,
        updated_at: now
      })
      .onConflict(oc => oc
        .columns(['user_id', 'module_id'])
        .doUpdateSet(eb => ({
          evidence_type: eb.ref('excluded.evidence_type'),
          url: eb.ref('excluded.url'),
          note: eb.ref('excluded.note'),
          review_status: 'pendiente',
          updated_at: eb.ref('excluded.updated_at')
        })))
      .execute()
  }

  return await getModuleEvidence(db, userId, moduleId) as ModuleEvidence
}

export async function getEvidenceById(db: DatabaseClient, evidenceId: number): Promise<ModuleEvidence | null> {
  if (db.backend !== 'postgres') {
    const row = await db.get<ModuleEvidence>(
      `SELECT ${SELECT_COLUMNS}
       FROM user_module_evidences
       WHERE id = ?`,
      [evidenceId]
    )
    return row || null
  }

  const row = await getQueryDatabase(pool(db))
    .selectFrom('user_module_evidences')
    .select([
      'id', 'user_id', 'module_id', 'evidence_type', 'url', 'note',
      'review_status', 'admin_comment', 'reviewed_at', 'reviewed_by_user_id',
      'created_at', 'updated_at'
    ])
    .where('id', '=', evidenceId)
    .executeTakeFirst()

  if (!row) return null
  return { ...row, review_status: row.review_status ?? 'pendiente' } as unknown as ModuleEvidence
}

export async function reviewModuleEvidence(
  db: DatabaseClient,
  evidenceId: number,
  adminUserId: number,
  input: { reviewStatus: EvidenceReviewStatus; adminComment?: string | null }
): Promise<ModuleEvidence | null> {
  if (!EVIDENCE_REVIEW_STATUSES.includes(input.reviewStatus)) {
    throw new Error('Estado de revisión no válido')
  }

  const now = new Date().toISOString()
  const comment = input.adminComment?.trim() ? input.adminComment.trim() : null

  if (db.backend !== 'postgres') {
    await db.run(
      `UPDATE user_module_evidences
       SET review_status = ?,
           admin_comment = ?,
           reviewed_at = ?,
           reviewed_by_user_id = ?,
           updated_at = ?
       WHERE id = ?`,
      [input.reviewStatus, comment, now, adminUserId, now, evidenceId]
    )

    const row = await db.get<ModuleEvidence>(
      `SELECT ${SELECT_COLUMNS}
       FROM user_module_evidences
       WHERE id = ?`,
      [evidenceId]
    )
    return row || null
  }

  const kdb = getQueryDatabase(pool(db))
  await kdb
    .updateTable('user_module_evidences')
    .set({
      review_status: input.reviewStatus,
      admin_comment: comment,
      reviewed_at: now,
      reviewed_by_user_id: adminUserId,
      updated_at: now
    })
    .where('id', '=', evidenceId)
    .execute()

  const row = await kdb
    .selectFrom('user_module_evidences')
    .select([
      'id', 'user_id', 'module_id', 'evidence_type', 'url', 'note',
      'review_status', 'admin_comment', 'reviewed_at', 'reviewed_by_user_id',
      'created_at', 'updated_at'
    ])
    .where('id', '=', evidenceId)
    .executeTakeFirst()

  if (!row) return null
  return { ...row, review_status: row.review_status ?? 'pendiente' } as unknown as ModuleEvidence
}

export async function deleteModuleEvidence(db: DatabaseClient, userId: number, moduleId: number): Promise<number> {
  if (db.backend !== 'postgres') {
    const result = await db.run(
      'DELETE FROM user_module_evidences WHERE user_id = ? AND module_id = ?',
      [userId, moduleId]
    )
    return result.changes ?? 0
  }

  const result = await getQueryDatabase(pool(db))
    .deleteFrom('user_module_evidences')
    .where('user_id', '=', userId)
    .where('module_id', '=', moduleId)
    .executeTakeFirst()

  return Number(result.numDeletedRows ?? 0)
}

export type EvidenceListFilters = {
  userId?: number | null
  moduleId?: number | null
  roadmapId?: number | null
  status?: EvidenceReviewStatus | null
}

export type EvidenceListRow = {
  id: number
  user_id: number
  module_id: number
  evidence_type: string
  url: string | null
  note: string | null
  review_status: string
  admin_comment: string | null
  reviewed_at: string | null
  reviewed_by_user_id: number | null
  created_at: string
  updated_at: string
  user_email: string
  user_name: string | null
  module_title: string
  module_position: number | null
  roadmap_id: number
  roadmap_title: string
}

export async function listEvidences(db: DatabaseClient, filters: EvidenceListFilters): Promise<EvidenceListRow[]> {
  if (db.backend !== 'postgres') {
    const clauses: string[] = []
    const params: (number | string)[] = []
    if (filters.userId) {
      clauses.push('e.user_id = ?')
      params.push(filters.userId)
    }
    if (filters.moduleId) {
      clauses.push('e.module_id = ?')
      params.push(filters.moduleId)
    }
    if (filters.roadmapId) {
      clauses.push('m.roadmap_id = ?')
      params.push(filters.roadmapId)
    }
    if (filters.status) {
      clauses.push("COALESCE(e.review_status, 'pendiente') = ?")
      params.push(filters.status)
    }

    return db.all<EvidenceListRow>(
      `SELECT e.id, e.user_id, e.module_id, e.evidence_type, e.url, e.note,
              COALESCE(e.review_status, 'pendiente') AS review_status,
              e.admin_comment, e.reviewed_at, e.reviewed_by_user_id,
              e.created_at, e.updated_at,
              u.email AS user_email, u.name AS user_name,
              m.title AS module_title, m.position AS module_position,
              r.id AS roadmap_id, r.title AS roadmap_title
       FROM user_module_evidences e
       INNER JOIN users u ON u.id = e.user_id
       INNER JOIN modules m ON m.id = e.module_id
       INNER JOIN roadmaps r ON r.id = m.roadmap_id
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY e.updated_at DESC, e.id DESC`,
      params
    )
  }

  const rows = await getQueryDatabase(pool(db))
    .selectFrom('user_module_evidences as e')
    .innerJoin('users as u', 'u.id', 'e.user_id')
    .innerJoin('modules as m', 'm.id', 'e.module_id')
    .innerJoin('roadmaps as r', 'r.id', 'm.roadmap_id')
    .select([
      'e.id as id', 'e.user_id as user_id', 'e.module_id as module_id',
      'e.evidence_type as evidence_type', 'e.url as url', 'e.note as note',
      'e.review_status as review_status', 'e.admin_comment as admin_comment',
      'e.reviewed_at as reviewed_at', 'e.reviewed_by_user_id as reviewed_by_user_id',
      'e.created_at as created_at', 'e.updated_at as updated_at',
      'u.email as user_email', 'u.name as user_name',
      'm.title as module_title', 'm.position as module_position',
      'r.id as roadmap_id', 'r.title as roadmap_title'
    ])
    .$if(!!filters.userId, qb => qb.where('e.user_id', '=', filters.userId as number))
    .$if(!!filters.moduleId, qb => qb.where('e.module_id', '=', filters.moduleId as number))
    .$if(!!filters.roadmapId, qb => qb.where('m.roadmap_id', '=', filters.roadmapId as number))
    .$if(!!filters.status, qb => qb.where('e.review_status', '=', filters.status as string))
    .orderBy('e.updated_at', 'desc')
    .orderBy('e.id', 'desc')
    .execute()

  return rows.map(row => ({
    ...row,
    review_status: row.review_status ?? 'pendiente'
  })) as unknown as EvidenceListRow[]
}
