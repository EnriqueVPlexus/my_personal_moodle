import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openSqliteDb, openSqliteDbReadOnly } from '../../lib/persistence'
import { PostgresDb } from '../../lib/persistence/postgresDb'
import { migrateSqliteToPostgres } from '../../scripts/migrate-sqlite-to-postgres'

const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeIfPostgres = DATABASE_URL ? describe : describe.skip

describeIfPostgres('SQLite to Postgres migration (real postgres)', () => {
  let target: PostgresDb | undefined
  let source: Awaited<ReturnType<typeof openSqliteDb>> | undefined
  let sourceDirectory: string | undefined
  const marker = `sqlite-migration-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const title = `${marker}-roadmap`
  const categoryKey = `${marker}-category`
  const topicKey = `${marker}-topic`
  const email = `${marker}@example.test`
  const auditAction = `${marker}-audit`
  const rollbackTitle = `${marker}-rollback-roadmap`
  const timestamp = '2026-10-17T08:00:00.000Z'

  beforeAll(async () => {
    target = new PostgresDb(DATABASE_URL as string)
    await target.migrate()
    sourceDirectory = await mkdtemp(path.join(os.tmpdir(), 'sqlite-migration-'))
    source = await openSqliteDb(path.join(sourceDirectory, 'source.db'))

    const category = await source.run(
      'INSERT INTO roadmap_categories (key, label) VALUES (?, ?)',
      [categoryKey, 'Migration category']
    )
    const topic = await source.run(
      'INSERT INTO topics (key, label) VALUES (?, ?)',
      [topicKey, 'Migration topic']
    )
    const roadmap = await source.run(
      `INSERT INTO roadmaps (title, category_id, version, published_at)
       VALUES (?, ?, ?, ?)`,
      [title, category.lastID, 'v1.0.0', timestamp]
    )
    const moduleRow = await source.run(
      'INSERT INTO modules (roadmap_id, position, title) VALUES (?, ?, ?)',
      [roadmap.lastID, 1, `${marker}-module`]
    )
    const lesson = await source.run(
      'INSERT INTO lessons (module_id, title, completed) VALUES (?, ?, ?)',
      [moduleRow.lastID, `${marker}-lesson`, 1]
    )
    const user = await source.run(
      `INSERT INTO users (email, name, role, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [email, marker, 'user', 'test-password-hash', timestamp, timestamp]
    )

    await source.run(
      'INSERT INTO roadmap_topics (roadmap_id, topic_id) VALUES (?, ?)',
      [roadmap.lastID, topic.lastID]
    )
    await source.run(
      'INSERT INTO user_roadmap_access (user_id, roadmap_id, created_at) VALUES (?, ?, ?)',
      [user.lastID, roadmap.lastID, timestamp]
    )
    await source.run(
      `INSERT INTO user_lesson_progress
       (user_id, lesson_id, started_at, last_activity_at, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user.lastID, lesson.lastID, timestamp, timestamp, timestamp, timestamp, timestamp]
    )
    await source.run(
      `INSERT INTO user_roadmap_progress
       (user_id, roadmap_id, current_module_id, current_lesson_id, started_at,
        last_activity_at, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.lastID, roadmap.lastID, moduleRow.lastID, lesson.lastID,
        timestamp, timestamp, timestamp, timestamp, timestamp]
    )
    await source.run(
      `INSERT INTO user_quiz_attempts
       (user_id, roadmap_id, module_id, score, max_score, submitted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.lastID, roadmap.lastID, moduleRow.lastID, 1, 1, timestamp, timestamp, timestamp]
    )
    await source.run(
      `INSERT INTO user_module_evidences
       (user_id, module_id, evidence_type, url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.lastID, moduleRow.lastID, 'url', 'https://example.test/evidence', timestamp, timestamp]
    )
    await source.run(
      `INSERT INTO audit_logs
       (actor_user_id, actor_email, action, entity_type, entity_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.lastID, email, auditAction, 'roadmap', title, timestamp]
    )
  })

  afterAll(async () => {
    await source?.close()
    if (target) {
      await target.run('DELETE FROM audit_logs WHERE action = ?', [auditAction])
      await target.run('DELETE FROM users WHERE email = ?', [email])
      await target.run('DELETE FROM roadmaps WHERE title = ?', [title])
      await target.run('DELETE FROM roadmap_categories WHERE key = ?', [categoryKey])
      await target.run('DELETE FROM topics WHERE key = ?', [topicKey])
      await target.close()
    }
    if (sourceDirectory) await rm(sourceDirectory, { recursive: true, force: true })
  })

  it('previews created rows and relationships without changing the target', async () => {
    const result = await migrateSqliteToPostgres({
      apply: false,
      source: path.join(sourceDirectory!, 'source.db'),
      databaseUrl: DATABASE_URL as string
    })

    expect(result.created).toEqual({
      roadmap_categories: 1,
      topics: 1,
      roadmaps: 1,
      modules: 1,
      lessons: 1,
      users: 1
    })
    expect(result.preserved).toEqual({})
    expect(result.migrated).toEqual({
      roadmap_topics: 1,
      user_roadmap_access: 1,
      user_lesson_progress: 1,
      user_roadmap_progress: 1,
      user_quiz_attempts: 1,
      user_module_evidences: 1,
      audit_logs: 1
    })
    expect(result.unmapped).toEqual({})
    expect(result.skipped).toEqual(['sessions', 'rate_limits', 'quiz_attempt_sessions'])
    expect(result.applied).toBe(false)

    const untouched = await target!.get(
      'SELECT COUNT(*)::int AS count FROM roadmaps WHERE title = ?',
      [title]
    )
    expect(untouched.count).toBe(0)

    const readonlySource = await openSqliteDbReadOnly(path.join(sourceDirectory!, 'source.db'))
    await expect(
      readonlySource.run('INSERT INTO topics (key, label) VALUES (?, ?)', [`${marker}-blocked`, 'Blocked'])
    ).rejects.toThrow()
    await readonlySource.close()
  })

  it('applies mapped records and preserves their relationships', async () => {
    const result = await migrateSqliteToPostgres({
      apply: true,
      source: path.join(sourceDirectory!, 'source.db'),
      databaseUrl: DATABASE_URL as string
    })

    expect(result.created).toEqual({
      roadmap_categories: 1,
      topics: 1,
      roadmaps: 1,
      modules: 1,
      lessons: 1,
      users: 1
    })
    expect(result.migrated).toHaveProperty('user_lesson_progress', 1)
    expect(result.unmapped).toEqual({})

    const imported = await target!.get(
      `SELECT
        (SELECT COUNT(*) FROM roadmaps r JOIN roadmap_categories c ON c.id = r.category_id WHERE r.title = ? AND c.key = ?)::int AS category,
        (SELECT COUNT(*) FROM modules m JOIN roadmaps r ON r.id = m.roadmap_id WHERE r.title = ?)::int AS modules,
        (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id JOIN roadmaps r ON r.id = m.roadmap_id WHERE r.title = ?)::int AS lessons,
        (SELECT COUNT(*) FROM roadmap_topics rt JOIN roadmaps r ON r.id = rt.roadmap_id JOIN topics t ON t.id = rt.topic_id WHERE r.title = ? AND t.key = ?)::int AS roadmap_topics,
        (SELECT COUNT(*) FROM user_roadmap_access a JOIN users u ON u.id = a.user_id JOIN roadmaps r ON r.id = a.roadmap_id WHERE u.email = ? AND r.title = ?)::int AS roadmap_access,
        (SELECT COUNT(*) FROM user_roadmap_progress p JOIN users u ON u.id = p.user_id WHERE u.email = ?)::int AS roadmap_progress,
        (SELECT COUNT(*) FROM user_lesson_progress p JOIN users u ON u.id = p.user_id WHERE u.email = ?)::int AS lesson_progress,
        (SELECT COUNT(*) FROM user_quiz_attempts q JOIN users u ON u.id = q.user_id WHERE u.email = ?)::int AS quiz_attempts,
        (SELECT COUNT(*) FROM user_module_evidences e JOIN users u ON u.id = e.user_id WHERE u.email = ?)::int AS evidences,
        (SELECT COUNT(*) FROM audit_logs a JOIN users u ON u.id = a.actor_user_id WHERE a.action = ? AND u.email = ?)::int AS audit_logs`,
      [title, categoryKey, title, title, title, topicKey, email, title, email, email, email, email, auditAction, email]
    )
    expect(imported).toEqual({
      category: 1,
      modules: 1,
      lessons: 1,
      roadmap_topics: 1,
      roadmap_access: 1,
      roadmap_progress: 1,
      lesson_progress: 1,
      quiz_attempts: 1,
      evidences: 1,
      audit_logs: 1
    })
  })

  it('does not duplicate content when the import is applied again', async () => {
    const result = await migrateSqliteToPostgres({
      apply: true,
      source: path.join(sourceDirectory!, 'source.db'),
      databaseUrl: DATABASE_URL as string
    })

    expect(result.created).toEqual({})
    expect(result.preserved).toEqual({
      roadmap_categories: 1,
      topics: 1,
      roadmaps: 1,
      modules: 1,
      lessons: 1,
      users: 1
    })

    const count = await target!.get(
      'SELECT COUNT(*)::int AS count FROM users WHERE email = ?',
      [email]
    )
    expect(count.count).toBe(1)
  })

  it('rolls back all imported rows if a source record is invalid', async () => {
    await source!.run(
      'INSERT INTO roadmaps (title, version, published_at) VALUES (?, ?, ?)',
      [rollbackTitle, 'v1.0.0', timestamp]
    )
    await source!.run('UPDATE users SET role = ? WHERE email = ?', ['invalid-role', email])

    try {
      await expect(migrateSqliteToPostgres({
        apply: true,
        source: path.join(sourceDirectory!, 'source.db'),
        databaseUrl: DATABASE_URL as string
      })).rejects.toThrow('La SQLite contiene un usuario inválido')

      const rolledBack = await target!.get(
        'SELECT COUNT(*)::int AS count FROM roadmaps WHERE title = ?',
        [rollbackTitle]
      )
      expect(rolledBack.count).toBe(0)
    } finally {
      await source!.run('UPDATE users SET role = ? WHERE email = ?', ['user', email])
      await source!.run('DELETE FROM roadmaps WHERE title = ?', [rollbackTitle])
    }
  })
})
