import fs from 'node:fs'
import path from 'node:path'
import { loadEnvConfig } from '@next/env'
import { openSqliteDb } from '../lib/db'
import { PostgresDb } from '../lib/postgresDb'

type Row = Record<string, any>
type MigrationOptions = { apply: boolean; source: string; databaseUrl: string }
type MigrationResult = {
  created: Record<string, number>
  preserved: Record<string, number>
  migrated: Record<string, number>
  skipped: string[]
  applied: boolean
}

const SKIPPED_TABLES = ['sessions']

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function normalized(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase('es')
}

function addCount(target: Record<string, number>, key: string) {
  target[key] = (target[key] || 0) + 1
}

function parseOptions(): MigrationOptions {
  const sourceArgument = process.argv.find(argument => argument.startsWith('--source='))
  const source = sourceArgument
    ? path.resolve(sourceArgument.slice('--source='.length))
    : path.resolve(process.cwd(), 'data/dev.db')
  const databaseUrl = process.env.DATABASE_URL || ''
  if (!databaseUrl) throw new Error('DATABASE_URL es obligatoria para migrar.')
  if (!fs.existsSync(source)) throw new Error(`No existe la base SQLite: ${source}`)
  return { apply: process.argv.includes('--apply'), source, databaseUrl }
}

async function rows(source: any, table: string) {
  return source.all(`SELECT * FROM ${quoteIdentifier(table)}`) as Promise<Row[]>
}

async function copyContent(source: any, target: PostgresDb, result: MigrationResult) {
  const categoryIds = new Map<number, number>()
  for (const row of await rows(source, 'roadmap_categories')) {
    const existing = await target.get('SELECT id FROM roadmap_categories WHERE key = ?', [row.key])
    if (existing) {
      categoryIds.set(Number(row.id), Number(existing.id))
      addCount(result.preserved, 'roadmap_categories')
    } else if (result.applied) {
      const created = await target.run('INSERT INTO roadmap_categories (key, label) VALUES (?, ?)', [row.key, row.label])
      categoryIds.set(Number(row.id), Number(created.lastID))
      addCount(result.created, 'roadmap_categories')
    }
  }

  const topicIds = new Map<number, number>()
  for (const row of await rows(source, 'topics')) {
    const existing = await target.get('SELECT id FROM topics WHERE key = ?', [row.key])
    if (existing) {
      topicIds.set(Number(row.id), Number(existing.id))
      addCount(result.preserved, 'topics')
    } else if (result.applied) {
      const created = await target.run('INSERT INTO topics (key, label) VALUES (?, ?)', [row.key, row.label])
      topicIds.set(Number(row.id), Number(created.lastID))
      addCount(result.created, 'topics')
    }
  }

  const roadmapIds = new Map<number, number>()
  for (const row of await rows(source, 'roadmaps')) {
    const existing = await target.get(
      'SELECT id FROM roadmaps WHERE lower(trim(title)) = lower(trim(?))',
      [row.title]
    )
    if (existing) {
      roadmapIds.set(Number(row.id), Number(existing.id))
      addCount(result.preserved, 'roadmaps')
    } else if (result.applied) {
      const created = await target.run(
        `INSERT INTO roadmaps (
          title, description, duration, objectives, methodology, evaluation_weights,
          category_id, duration_weeks_min, duration_weeks_max, version, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.title, row.description, row.duration, row.objectives, row.methodology,
          row.evaluation_weights, categoryIds.get(Number(row.category_id)) || null,
          row.duration_weeks_min, row.duration_weeks_max, row.version || 'v1.0.0',
          row.published_at || new Date().toISOString()]
      )
      roadmapIds.set(Number(row.id), Number(created.lastID))
      addCount(result.created, 'roadmaps')
    }
  }

  const moduleIds = new Map<number, number>()
  for (const row of await rows(source, 'modules')) {
    const roadmapId = roadmapIds.get(Number(row.roadmap_id))
    if (!roadmapId) continue
    const existing = await target.get(
      `SELECT id FROM modules WHERE roadmap_id = ? AND (
        (position IS NOT NULL AND position = ?) OR lower(trim(title)) = lower(trim(?)))`,
      [roadmapId, row.position, row.title]
    )
    if (existing) {
      moduleIds.set(Number(row.id), Number(existing.id))
      addCount(result.preserved, 'modules')
    } else if (result.applied) {
      const created = await target.run(
        `INSERT INTO modules (
          roadmap_id, position, title, duration, duration_weeks_min, duration_weeks_max,
          level, objective, contents, importance, official_resources, support_videos,
          practical_activity, deliverable_evidence, evaluation, quiz_bank,
          quiz_pass_percentage, quiz_max_attempts, quiz_cooldown_minutes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [roadmapId, row.position, row.title, row.duration, row.duration_weeks_min,
          row.duration_weeks_max, row.level, row.objective, row.contents, row.importance,
          row.official_resources, row.support_videos, row.practical_activity,
          row.deliverable_evidence, row.evaluation, row.quiz_bank,
          row.quiz_pass_percentage, row.quiz_max_attempts, row.quiz_cooldown_minutes]
      )
      moduleIds.set(Number(row.id), Number(created.lastID))
      addCount(result.created, 'modules')
    }
  }

  const lessonIds = new Map<number, number>()
  for (const row of await rows(source, 'lessons')) {
    const moduleId = moduleIds.get(Number(row.module_id))
    if (!moduleId) continue
    const existing = await target.get(
      'SELECT id FROM lessons WHERE module_id = ? AND lower(trim(title)) = lower(trim(?))',
      [moduleId, row.title]
    )
    if (existing) {
      lessonIds.set(Number(row.id), Number(existing.id))
      addCount(result.preserved, 'lessons')
    } else if (result.applied) {
      const created = await target.run(
        'INSERT INTO lessons (module_id, title, completed) VALUES (?, ?, ?)',
        [moduleId, row.title, row.completed || 0]
      )
      lessonIds.set(Number(row.id), Number(created.lastID))
      addCount(result.created, 'lessons')
    }
  }

  if (result.applied) {
    for (const row of await rows(source, 'roadmap_topics')) {
      const roadmapId = roadmapIds.get(Number(row.roadmap_id))
      const topicId = topicIds.get(Number(row.topic_id))
      if (roadmapId && topicId) {
        await target.run(
          'INSERT INTO roadmap_topics (roadmap_id, topic_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
          [roadmapId, topicId]
        )
      }
    }
  }

  return { roadmapIds, moduleIds, lessonIds }
}

async function copyUsers(source: any, target: PostgresDb, result: MigrationResult) {
  const userIds = new Map<number, number>()
  for (const row of await rows(source, 'users')) {
    if (typeof row.email !== 'string' || !row.email.trim() ||
        typeof row.password_hash !== 'string' || !row.password_hash.trim() ||
        !['admin', 'user'].includes(String(row.role))) {
      throw new Error('La SQLite contiene un usuario inválido: email, password_hash o role no cumplen el contrato.')
    }
    const email = normalized(row.email)
    const existing = await target.get('SELECT id FROM users WHERE lower(email) = ?', [email])
    if (existing) {
      userIds.set(Number(row.id), Number(existing.id))
      addCount(result.preserved, 'users')
    } else if (result.applied) {
      const created = await target.run(
        `INSERT INTO users (email, name, role, password_hash, can_view_all_roadmaps, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [email, row.name, row.role, row.password_hash, row.can_view_all_roadmaps ?? 1,
          row.is_active ?? 1, row.created_at, row.updated_at]
      )
      userIds.set(Number(row.id), Number(created.lastID))
      addCount(result.created, 'users')
    }
  }
  return userIds
}

async function copyUserData(source: any, target: PostgresDb, result: MigrationResult, ids: any) {
  const { userIds, roadmapIds, moduleIds, lessonIds } = ids
  for (const row of await rows(source, 'user_roadmap_access')) {
    const userId = userIds.get(Number(row.user_id))
    const roadmapId = roadmapIds.get(Number(row.roadmap_id))
    if (result.applied && userId && roadmapId) {
      await target.run(
        'INSERT INTO user_roadmap_access (user_id, roadmap_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
        [userId, roadmapId, row.created_at]
      )
    }
    addCount(result.migrated, 'user_roadmap_access')
  }

  for (const row of await rows(source, 'user_lesson_progress')) {
    const userId = userIds.get(Number(row.user_id))
    const lessonId = lessonIds.get(Number(row.lesson_id))
    if (result.applied && userId && lessonId) {
      await target.run(
        `INSERT INTO user_lesson_progress (
          user_id, lesson_id, started_at, last_activity_at, completed_at,
          time_spent_seconds, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id, lesson_id) DO UPDATE SET
          started_at = COALESCE(user_lesson_progress.started_at, EXCLUDED.started_at),
          last_activity_at = GREATEST(user_lesson_progress.last_activity_at, EXCLUDED.last_activity_at),
          completed_at = COALESCE(user_lesson_progress.completed_at, EXCLUDED.completed_at),
          time_spent_seconds = GREATEST(user_lesson_progress.time_spent_seconds, EXCLUDED.time_spent_seconds),
          updated_at = GREATEST(user_lesson_progress.updated_at, EXCLUDED.updated_at)`,
        [userId, lessonId, row.started_at, row.last_activity_at, row.completed_at,
          row.time_spent_seconds, row.created_at, row.updated_at]
      )
    }
    addCount(result.migrated, 'user_lesson_progress')
  }

  for (const row of await rows(source, 'user_roadmap_progress')) {
    const userId = userIds.get(Number(row.user_id))
    const roadmapId = roadmapIds.get(Number(row.roadmap_id))
    const moduleId = row.current_module_id ? moduleIds.get(Number(row.current_module_id)) : null
    const lessonId = row.current_lesson_id ? lessonIds.get(Number(row.current_lesson_id)) : null
    if (result.applied && userId && roadmapId) {
      await target.run(
        `INSERT INTO user_roadmap_progress (
          user_id, roadmap_id, current_module_id, current_lesson_id, started_at,
          last_activity_at, completed_at, completed_lessons_count, time_spent_seconds,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id, roadmap_id) DO UPDATE SET
          current_module_id = COALESCE(EXCLUDED.current_module_id, user_roadmap_progress.current_module_id),
          current_lesson_id = COALESCE(EXCLUDED.current_lesson_id, user_roadmap_progress.current_lesson_id),
          last_activity_at = GREATEST(user_roadmap_progress.last_activity_at, EXCLUDED.last_activity_at),
          completed_lessons_count = GREATEST(user_roadmap_progress.completed_lessons_count, EXCLUDED.completed_lessons_count),
          time_spent_seconds = GREATEST(user_roadmap_progress.time_spent_seconds, EXCLUDED.time_spent_seconds),
          updated_at = GREATEST(user_roadmap_progress.updated_at, EXCLUDED.updated_at)`,
        [userId, roadmapId, moduleId, lessonId, row.started_at, row.last_activity_at,
          row.completed_at, row.completed_lessons_count, row.time_spent_seconds,
          row.created_at, row.updated_at]
      )
    }
    addCount(result.migrated, 'user_roadmap_progress')
  }

  for (const row of await rows(source, 'user_quiz_attempts')) {
    const userId = userIds.get(Number(row.user_id))
    const roadmapId = row.roadmap_id ? roadmapIds.get(Number(row.roadmap_id)) : null
    const moduleId = row.module_id ? moduleIds.get(Number(row.module_id)) : null
    if (result.applied && userId && (!row.roadmap_id || roadmapId) && (!row.module_id || moduleId)) {
      const existing = await target.get(
        `SELECT id FROM user_quiz_attempts
         WHERE user_id = ? AND module_id IS NOT DISTINCT FROM ?
           AND submitted_at = ? AND score IS NOT DISTINCT FROM ?`,
        [userId, moduleId, row.submitted_at, row.score]
      )
      if (!existing) {
        await target.run(
          `INSERT INTO user_quiz_attempts (
            user_id, roadmap_id, module_id, quiz_scope, score, max_score, answers,
            submitted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [userId, roadmapId, moduleId, row.quiz_scope, row.score, row.max_score,
            row.answers, row.submitted_at, row.created_at, row.updated_at]
        )
      }
    }
    addCount(result.migrated, 'user_quiz_attempts')
  }

  for (const row of await rows(source, 'user_module_evidences')) {
    const userId = userIds.get(Number(row.user_id))
    const moduleId = moduleIds.get(Number(row.module_id))
    if (result.applied && userId && moduleId) {
      await target.run(
        `INSERT INTO user_module_evidences (
          user_id, module_id, evidence_type, url, note, review_status, admin_comment,
          reviewed_at, reviewed_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id, module_id) DO UPDATE SET
          evidence_type = EXCLUDED.evidence_type, url = EXCLUDED.url, note = EXCLUDED.note,
          review_status = EXCLUDED.review_status, admin_comment = EXCLUDED.admin_comment,
          reviewed_at = EXCLUDED.reviewed_at, reviewed_by_user_id = EXCLUDED.reviewed_by_user_id,
          updated_at = EXCLUDED.updated_at`,
        [userId, moduleId, row.evidence_type, row.url, row.note, row.review_status,
          row.admin_comment, row.reviewed_at,
          row.reviewed_by_user_id ? userIds.get(Number(row.reviewed_by_user_id)) : null,
          row.created_at, row.updated_at]
      )
    }
    addCount(result.migrated, 'user_module_evidences')
  }
}

async function copyAudit(source: any, target: PostgresDb, result: MigrationResult, userIds: Map<number, number>) {
  for (const row of await rows(source, 'audit_logs')) {
    if (result.applied) {
      const existing = await target.get(
        `SELECT id FROM audit_logs WHERE action = ? AND entity_type = ?
         AND entity_id IS NOT DISTINCT FROM ? AND created_at = ?`,
        [row.action, row.entity_type, row.entity_id, row.created_at]
      )
      if (!existing) {
        await target.run(
          `INSERT INTO audit_logs (
            actor_user_id, actor_email, action, entity_type, entity_id, details,
            ip_address, user_agent, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.actor_user_id ? userIds.get(Number(row.actor_user_id)) : null, row.actor_email,
            row.action, row.entity_type, row.entity_id, row.details, row.ip_address,
            row.user_agent, row.created_at]
        )
      }
    }
    addCount(result.migrated, 'audit_logs')
  }
}

export async function migrateSqliteToPostgres(options: MigrationOptions) {
  const source = await openSqliteDb(options.source)
  const target = new PostgresDb(options.databaseUrl)
  const result: MigrationResult = { created: {}, preserved: {}, migrated: {}, skipped: SKIPPED_TABLES, applied: options.apply }
  try {
    await target.migrate()
    const content = await copyContent(source, target, result)
    const userIds = await copyUsers(source, target, result)
    await copyUserData(source, target, result, { userIds, ...content })
    await copyAudit(source, target, result, userIds)
    return result
  } finally {
    await source.close()
    await target.close()
  }
}

async function main() {
  loadEnvConfig(process.cwd())
  const sourceArgument = process.argv.find(argument => argument.startsWith('--source='))
  const source = sourceArgument ? path.resolve(sourceArgument.slice('--source='.length)) : path.resolve(process.cwd(), 'data/dev.db')
  const databaseUrl = process.env.DATABASE_URL || ''
  if (!databaseUrl) throw new Error('DATABASE_URL es obligatoria para migrar.')
  if (!fs.existsSync(source)) throw new Error(`No existe la base SQLite: ${source}`)
  const result = await migrateSqliteToPostgres({ apply: process.argv.includes('--apply'), source, databaseUrl })
  console.log(result.applied ? 'Migración inteligente aplicada.' : 'Simulación inteligente completada. No se modificó PostgreSQL.')
  console.log(`Creados: ${JSON.stringify(result.created)}`)
  console.log(`Conservados en remoto: ${JSON.stringify(result.preserved)}`)
  console.log(`Datos de usuario preparados: ${JSON.stringify(result.migrated)}`)
  console.log(`Sesiones omitidas: ${result.skipped.join(', ')}`)
  if (!result.applied) console.log('Para aplicar: npm run migrate:postgres -- --apply')
}

if (process.argv[1]?.endsWith('migrate-sqlite-to-postgres.ts')) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
