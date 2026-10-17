import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServices } from '../../lib/container'
import { PostgresDb } from '../../lib/persistence/postgresDb'

/**
 * `pg` returns COUNT/SUM as text and EXISTS as a boolean. The repositories
 * normalize them, so what reaches the services (and the API) is a number or a
 * boolean, exactly as with SQLite. Real PostgreSQL only: see
 * test/postgres-integration/README.md (ephemeral Docker database, never any
 * other one).
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeIfPostgres = DATABASE_URL ? describe : describe.skip

describeIfPostgres('PostgreSQL aggregates reach the services as numbers (real postgres)', () => {
  let db: PostgresDb
  let categoryId: number
  let topicId: number
  let roadmapId: number
  let unclassifiedRoadmapId: number
  let moduleId: number
  let userId: number
  const marker = `pg-numeric-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const everything = { user: null, allRoadmaps: true, roadmapIds: [] as number[] }

  beforeAll(async () => {
    db = new PostgresDb(DATABASE_URL as string)
    await db.migrate()

    categoryId = (await db.run('INSERT INTO roadmap_categories (key, label) VALUES (?, ?)', [`${marker}-cat`, 'Cat'])).lastID as number
    topicId = (await db.run('INSERT INTO topics (key, label) VALUES (?, ?)', [`${marker}-topic`, 'Topic'])).lastID as number
    roadmapId = (await db.run(
      'INSERT INTO roadmaps (title, version, category_id, duration_weeks_min, duration_weeks_max) VALUES (?, ?, ?, ?, ?)',
      [`${marker}-roadmap`, 'v1.0.0', categoryId, 2, 6]
    )).lastID as number
    unclassifiedRoadmapId = (await db.run(
      'INSERT INTO roadmaps (title, version) VALUES (?, ?)',
      [`${marker}-unclassified`, 'v1.0.0']
    )).lastID as number
    await db.run('INSERT INTO roadmap_topics (roadmap_id, topic_id) VALUES (?, ?)', [roadmapId, topicId])
    moduleId = (await db.run(
      'INSERT INTO modules (roadmap_id, title, level) VALUES (?, ?, ?)',
      [roadmapId, `${marker}-m1`, 'beginner']
    )).lastID as number
    await db.run('INSERT INTO modules (roadmap_id, title, level) VALUES (?, ?, ?)', [roadmapId, `${marker}-m2`, 'beginner'])
    userId = (await db.run(
      `INSERT INTO users (email, name, role, password_hash, created_at, updated_at)
       VALUES (?, ?, 'user', 'x', ?, ?)`,
      [`${marker}@example.com`, 'Numeric', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
    )).lastID as number
    await db.run(
      "INSERT INTO user_module_evidences (user_id, module_id, evidence_type, url) VALUES (?, ?, 'repositorio', 'https://example.com')",
      [userId, moduleId]
    )
  })

  afterAll(async () => {
    for (const id of [roadmapId, unclassifiedRoadmapId]) if (id) await db.run('DELETE FROM roadmaps WHERE id = ?', [id])
    if (userId) await db.run('DELETE FROM users WHERE id = ?', [userId])
    if (topicId) await db.run('DELETE FROM topics WHERE id = ?', [topicId])
    if (categoryId) await db.run('DELETE FROM roadmap_categories WHERE id = ?', [categoryId])
    await db.close()
  })

  it('the raw driver really returns COUNT as text (guards the premise of the normalizer)', async () => {
    const row = await db.get('SELECT COUNT(*) AS n FROM modules WHERE roadmap_id = ?', [roadmapId])
    expect(typeof row.n).toBe('string')
  })

  it('catalog search rows carry module_count as a number', async () => {
    const rows = await createServices(db).content.searchCatalog(everything, { query: '', normalizedQuery: '', terms: [], tooLong: false })
    const row = rows.find((item: any) => item.id === roadmapId) as any

    expect(row.module_count).toBe(2)
    expect(typeof row.module_count).toBe('number')
  })

  it('catalog metadata counts are numbers', async () => {
    const { content } = createServices(db)
    const metadata = await content.getCatalogMetadata({ user: null, allRoadmaps: false, roadmapIds: [roadmapId, unclassifiedRoadmapId] })

    expect(metadata.categories).toEqual([{ key: `${marker}-cat`, label: 'Cat', roadmap_count: 1 }])
    expect(metadata.topics).toEqual([{ key: `${marker}-topic`, label: 'Topic', roadmap_count: 1 }])
    expect(metadata.levels.find(item => item.key === 'beginner')?.roadmap_count).toBe(1)
    expect(metadata.unclassified_roadmaps).toBe(1)
    expect(metadata.duration).toEqual({ min_weeks: 2, max_weeks: 6 })
    expect(metadata.duration_ranges.map(item => item.roadmap_count)).toEqual([1, 1, 0])

    const everyCount = [
      ...metadata.categories.map(item => item.roadmap_count),
      ...metadata.topics.map(item => item.roadmap_count),
      ...metadata.levels.map(item => item.roadmap_count),
      ...metadata.duration_ranges.map(item => item.roadmap_count),
      ...metadata.progress_statuses.map(item => item.roadmap_count),
      metadata.unclassified_roadmaps
    ]
    for (const count of everyCount) expect(typeof count).toBe('number')
  })

  it('has_evidence is a boolean for every module of a signed-in learner', async () => {
    const detail = await createServices(db).progress.getRoadmapDetail({ ...everything, user: { id: userId } }, roadmapId)
    const flags = detail?.modules.map((module: any) => [module.id, module.has_evidence])

    expect(flags).toContainEqual([moduleId, true])
    expect(detail?.modules.filter((module: any) => module.id !== moduleId).map((module: any) => module.has_evidence)).toEqual([false])
  })
})
