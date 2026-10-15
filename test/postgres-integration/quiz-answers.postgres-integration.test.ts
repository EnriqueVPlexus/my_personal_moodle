import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServices } from '../../lib/container'
import { PostgresDb } from '../../lib/persistence/postgresDb'

/**
 * Security regression against real PostgreSQL: no module read path used by the
 * API returns `quiz_bank` (the quiz answers). Only `findQuizSourceById` does,
 * and the service layer strips it before building a response.
 *
 * Requires TEST_DATABASE_URL/DATABASE_URL pointing at the ephemeral Docker
 * Postgres (docker-compose.test.yml). Skipped otherwise.
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeIfPostgres = DATABASE_URL ? describe : describe.skip

const QUIZ_BANK = JSON.stringify([
  { question: '¿Capital de Francia?', answer: 'París', options: ['París', 'Roma'], explanation: 'Es París' }
])
const FORBIDDEN = ['quiz_bank', 'correct_option_index', '"answer"']

describeIfPostgres('quiz answers never leave the services (real postgres)', () => {
  let db: PostgresDb
  let roadmapId: number
  let moduleId: number
  let userId: number
  const marker = `pg-quiz-leak-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const everything = { user: null, allRoadmaps: true, roadmapIds: [] as number[] }

  beforeAll(async () => {
    db = new PostgresDb(DATABASE_URL as string)
    await db.migrate()

    userId = (await db.run(
      `INSERT INTO users (email, name, role, password_hash, created_at, updated_at)
       VALUES (?, ?, 'user', 'x', ?, ?)`,
      [`${marker}@example.com`, 'Leak', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
    )).lastID as number
    roadmapId = (await db.run(
      'INSERT INTO roadmaps (title, version) VALUES (?, ?)',
      [`${marker}-roadmap`, 'v1.0.0']
    )).lastID as number
    moduleId = (await db.run(
      'INSERT INTO modules (roadmap_id, title, level, quiz_bank) VALUES (?, ?, ?, ?)',
      [roadmapId, `${marker}-module`, 'beginner', QUIZ_BANK]
    )).lastID as number
  })

  afterAll(async () => {
    if (roadmapId) await db.run('DELETE FROM roadmaps WHERE id = ?', [roadmapId])
    if (userId) await db.run('DELETE FROM users WHERE id = ?', [userId])
    await db.close()
  })

  function expectNoAnswers(value: unknown) {
    const text = JSON.stringify(value)
    for (const marker of FORBIDDEN) expect(text, `leaks ${marker}`).not.toContain(marker)
  }

  it('module repository list/get queries return the public projection only', async () => {
    const { content } = createServices(db)
    expectNoAnswers(await content.listModules(everything, roadmapId))
    expectNoAnswers(await content.listModules(everything))
    expectNoAnswers(await content.listModules({ ...everything, allRoadmaps: false, roadmapIds: [roadmapId] }))
    expect(await content.listModules(everything, roadmapId)).toHaveLength(1)
  })

  it('module create/update responses carry no quiz_bank', async () => {
    const { content } = createServices(db)
    const created = await content.createModule({
      roadmap_id: roadmapId,
      title: `${marker}-created`,
      level: 'beginner',
      duration: '',
      durationWeeks: { min: null, max: null }
    } as never)
    expectNoAnswers(created.module)
    expectNoAnswers(await content.updateModule(moduleId, { title: `${marker}-module` } as never))
  })

  it('roadmap detail modules carry no quiz_bank (anonymous and signed in)', async () => {
    const { progress } = createServices(db)
    expectNoAnswers(await progress.getRoadmapDetail(everything, roadmapId))
    const detail = await progress.getRoadmapDetail({ ...everything, user: { id: userId } }, roadmapId)
    expectNoAnswers(detail)
    expect(detail?.modules).toHaveLength(2)
  })

  it('module detail and public quiz carry no answers, while grading still reads them', async () => {
    const { progress } = createServices(db)
    const detail = await progress.getModuleDetail(everything, moduleId)
    expectNoAnswers(detail)
    expect(detail?.quiz.questions).toHaveLength(1)
    expectNoAnswers(await progress.getModuleQuiz(null, moduleId))

    const outcome = await progress.submitQuizAttempt(userId, moduleId, { 'bank-0': 0 })
    expect(outcome.status).toBe('ok')
  })
})
