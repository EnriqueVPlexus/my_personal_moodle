import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresDb } from '../../lib/persistence/postgresDb'
import { saveModuleQuizAttempt, getModuleQuizSummary, checkAttemptEligibility } from '../../lib/quizRepository'
import { buildModuleQuiz, type ModuleQuizSource } from '../../lib/domains/content/quizzes'

/**
 * Verifies lib/quizRepository.ts (attempts + per-module stats) against real
 * Postgres (backlog.md: "Tests de integracion contra PostgreSQL real" -
 * dominio quizzes). Exercises the aggregate/latest-attempt raw SQL passed
 * through Kysely's `sql` tag, including `ORDER BY submitted_at DESC` (the
 * Postgres branch drops SQLite's `datetime()` wrapper since submitted_at is
 * a native TIMESTAMPTZ column here) and the cooldown-window date arithmetic
 * in checkAttemptEligibility.
 *
 * Requires DATABASE_URL (or TEST_DATABASE_URL, which takes precedence and
 * should point at the isolated local Docker Postgres from
 * docker-compose.test.yml - see test/postgres-integration/README.md).
 * Skipped entirely otherwise so `vitest run` stays green without one.
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeIfPostgres = DATABASE_URL ? describe : describe.skip

describeIfPostgres('quizRepository (real postgres)', () => {
  let db: PostgresDb
  let userId: number
  let roadmapId: number
  let moduleId: number

  const marker = `pg-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`

  const quizModule: ModuleQuizSource = {
    id: 0,
    roadmap_id: 0,
    quiz_bank: JSON.stringify([
      { question: 'Q1', answer: 'A', options: ['A', 'B'], type: 'multiple_choice' },
      { question: 'Q2', answer: 'A', options: ['A', 'B'], type: 'multiple_choice' }
    ]),
    quiz_pass_percentage: 70,
    quiz_max_attempts: 3,
    quiz_cooldown_minutes: null
  } as unknown as ModuleQuizSource

  beforeAll(async () => {
    db = new PostgresDb(DATABASE_URL as string)
    await db.migrate()

    userId = (await db.run(
      'INSERT INTO users (email, name, role, password_hash, is_active) VALUES (?, ?, ?, ?, ?)',
      [`${marker}@example.com`, marker, 'user', 'not-a-real-hash', 1]
    )).lastID as number

    roadmapId = (await db.run('INSERT INTO roadmaps (title, version) VALUES (?, ?)', [`${marker}-roadmap`, 'v1.0.0'])).lastID as number
    moduleId = (await db.run('INSERT INTO modules (roadmap_id, position, title) VALUES (?, ?, ?)', [roadmapId, 0, `${marker}-module`])).lastID as number

    quizModule.id = moduleId
    quizModule.roadmap_id = roadmapId
  })

  afterAll(async () => {
    if (roadmapId) await db.run('DELETE FROM roadmaps WHERE id = ?', [roadmapId])
    if (userId) await db.run('DELETE FROM users WHERE id = ?', [userId])
    await db.close()
  })

  function allCorrectAnswers(m: ModuleQuizSource) {
    const quiz = buildModuleQuiz(m)
    return Object.fromEntries(quiz.questions.map(q => [q.id, q.correct_option_index]))
  }

  function allWrongAnswers(m: ModuleQuizSource) {
    const quiz = buildModuleQuiz(m)
    return Object.fromEntries(quiz.questions.map(q => [
      q.id,
      (q.correct_option_index + 1) % q.options.length
    ]))
  }

  it('saveModuleQuizAttempt persists a graded attempt and getModuleQuizSummary aggregates it', async () => {
    const failing = await saveModuleQuizAttempt(db, userId, quizModule, allWrongAnswers(quizModule))
    expect(failing.score).toBe(0)

    await new Promise(resolve => setTimeout(resolve, 5))
    const passing = await saveModuleQuizAttempt(db, userId, quizModule, allCorrectAnswers(quizModule))
    expect(passing.score).toBe(2)

    const summary = await getModuleQuizSummary(db, userId, moduleId)
    expect(summary.attempts_count).toBe(2)
    expect(summary.best_score_percentage).toBe(100)
    // latest attempt must be the passing one, proving ORDER BY submitted_at DESC works
    // against real TIMESTAMPTZ columns (not `datetime()`-wrapped TEXT as in SQLite).
    expect(summary.latest_attempt?.percentage).toBe(100)
  })

  it('checkAttemptEligibility blocks further attempts once quiz_max_attempts is reached', async () => {
    const before = await checkAttemptEligibility(db, userId, quizModule)
    expect(before.allowed).toBe(true)
    expect(before.remaining_attempts).toBe(1) // max 3, 2 already recorded

    await saveModuleQuizAttempt(db, userId, quizModule, allCorrectAnswers(quizModule))

    const after = await checkAttemptEligibility(db, userId, quizModule)
    expect(after.allowed).toBe(false)
    expect(after.remaining_attempts).toBe(0)
  })

  it('checkAttemptEligibility applies the cooldown window after a failed attempt', async () => {
    const cooldownModule: ModuleQuizSource = {
      id: 0,
      roadmap_id: roadmapId,
      quiz_bank: quizModule.quiz_bank,
      quiz_pass_percentage: 70,
      quiz_max_attempts: null,
      quiz_cooldown_minutes: 30
    } as unknown as ModuleQuizSource

    cooldownModule.id = (await db.run('INSERT INTO modules (roadmap_id, position, title) VALUES (?, ?, ?)', [roadmapId, 1, `${marker}-cooldown-module`])).lastID as number

    await saveModuleQuizAttempt(db, userId, cooldownModule, allWrongAnswers(cooldownModule))

    const eligibility = await checkAttemptEligibility(db, userId, cooldownModule)
    expect(eligibility.allowed).toBe(false)
    expect(eligibility.cooldown_ends_at).toBeTruthy()
    expect(new Date(eligibility.cooldown_ends_at as string).getTime()).toBeGreaterThan(Date.now())
  })
})
