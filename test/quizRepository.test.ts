import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const originalCwd = process.cwd()

async function withTempDb<T>(prefix: string, run: (db: any) => Promise<T>): Promise<T> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  process.chdir(tmp)
  const { openDb } = await import('../lib/persistence')
  const db = await openDb()
  try {
    return await run(db)
  } finally {
    await db.close()
  }
}

afterEach(async () => {
  process.chdir(originalCwd)
  vi.resetModules()
})

const MODULE_ID = 950004
const ROADMAP_ID = 950007

const moduleFixture = {
  id: MODULE_ID,
  roadmap_id: ROADMAP_ID,
  title: 'EC2',
  contents: '["AMI","Security groups"]',
  official_resources: '[{"label":"Amazon EC2","url":"https://aws.amazon.com/ec2/"}]',
  practical_activity: '["Crear instancia"]',
  deliverable_evidence: '["Captura de la instancia"]',
  evaluation: 'Quiz sobre EC2',
  quiz_pass_percentage: 70,
  quiz_max_attempts: null as number | null,
  quiz_cooldown_minutes: null as number | null
}

async function seedRoadmapAndUser(db: any, userId: number) {
  await db.exec(`
    INSERT INTO roadmaps (id, title) VALUES (${ROADMAP_ID}, 'Roadmap EC2');
    INSERT INTO modules (id, roadmap_id, title) VALUES (${MODULE_ID}, ${ROADMAP_ID}, 'EC2');
  `)
  await db.run(
    `INSERT INTO users (id, email, name, role, password_hash, can_view_all_roadmaps, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'user', 'hash', 1, 1, datetime('now'), datetime('now'))`,
    [userId, `quiz-${userId}@example.com`, `Quiz User ${userId}`]
  )
}

describe('quizRepository (sqlite backend)', () => {
  it('saves a quiz attempt with the graded score', async () => {
    await withTempDb('moodle-quiz-save-', async db => {
      const { saveModuleQuizAttempt } = await import('../lib/domains/progress/repositories/quizRepository')
      const userId = 700001
      await seedRoadmapAndUser(db, userId)

      const attempt = await saveModuleQuizAttempt(db, userId, moduleFixture, {
        'module-content': 0
      })

      expect(attempt).toMatchObject({
        max_score: expect.any(Number),
        score: expect.any(Number)
      })

      const stored = await db.get(
        'SELECT user_id, roadmap_id, module_id, quiz_scope, score, max_score FROM user_quiz_attempts WHERE user_id = ?',
        [userId]
      )
      expect(stored).toMatchObject({
        user_id: userId,
        roadmap_id: ROADMAP_ID,
        module_id: MODULE_ID,
        quiz_scope: 'module',
        score: attempt.score,
        max_score: attempt.max_score
      })
    })
  })

  it('returns null averages/best when there are no attempts', async () => {
    await withTempDb('moodle-quiz-empty-', async db => {
      const { getModuleQuizSummary } = await import('../lib/domains/progress/repositories/quizRepository')
      const userId = 700002
      await seedRoadmapAndUser(db, userId)

      const summary = await getModuleQuizSummary(db, userId, MODULE_ID)

      expect(summary).toMatchObject({
        attempts_count: 0,
        average_score_percentage: null,
        best_score_percentage: null,
        latest_attempt: null
      })
    })
  })

  it('aggregates attempts and orders the latest attempt by submitted_at', async () => {
    await withTempDb('moodle-quiz-summary-', async db => {
      const { saveModuleQuizAttempt } = await import('../lib/domains/progress/repositories/quizRepository')
      const userId = 700003
      await seedRoadmapAndUser(db, userId)

      await saveModuleQuizAttempt(db, userId, moduleFixture, { 'module-content': -1 })
      await new Promise(resolve => setTimeout(resolve, 10))
      const second = await saveModuleQuizAttempt(db, userId, moduleFixture, {})

      const { getModuleQuizSummary } = await import('../lib/domains/progress/repositories/quizRepository')
      const summary = await getModuleQuizSummary(db, userId, MODULE_ID)

      expect(summary.attempts_count).toBe(2)
      expect(summary.average_score_percentage).not.toBeNull()
      expect(summary.best_score_percentage).not.toBeNull()
      expect(summary.latest_attempt?.submitted_at).toBe(second.submitted_at)
    })
  })

  it('counts attempts for eligibility and blocks once max attempts is reached', async () => {
    await withTempDb('moodle-quiz-eligibility-', async db => {
      const { saveModuleQuizAttempt, checkAttemptEligibility } = await import('../lib/domains/progress/repositories/quizRepository')
      const userId = 700004
      await seedRoadmapAndUser(db, userId)
      const limited = { ...moduleFixture, quiz_max_attempts: 1 }

      const before = await checkAttemptEligibility(db, userId, limited)
      expect(before.allowed).toBe(true)
      expect(before.remaining_attempts).toBe(1)

      await saveModuleQuizAttempt(db, userId, limited, {})

      const after = await checkAttemptEligibility(db, userId, limited)
      expect(after).toMatchObject({ allowed: false, remaining_attempts: 0 })
    })
  })

  it('finds the last failed attempt to compute a cooldown window', async () => {
    await withTempDb('moodle-quiz-cooldown-', async db => {
      const { saveModuleQuizAttempt, checkAttemptEligibility } = await import('../lib/domains/progress/repositories/quizRepository')
      const userId = 700005
      await seedRoadmapAndUser(db, userId)
      const cooled = { ...moduleFixture, quiz_cooldown_minutes: 30 }

      await saveModuleQuizAttempt(db, userId, cooled, { 'module-content': -1 })

      const eligibility = await checkAttemptEligibility(db, userId, cooled)

      expect(eligibility.allowed).toBe(false)
      expect(eligibility.cooldown_ends_at).not.toBeNull()
    })
  })
})

describe('listUserQuizAttempts (sqlite backend)', () => {
  it('lists only the given user attempts, oldest first, with titles and percentage', async () => {
    await withTempDb('moodle-quiz-export-', async db => {
      const { saveModuleQuizAttempt, listUserQuizAttempts } = await import('../lib/domains/progress/repositories/quizRepository')
      const userId = 700010
      const otherId = 700011
      await seedRoadmapAndUser(db, userId)
      await db.run(
        `INSERT INTO users (id, email, name, role, password_hash, can_view_all_roadmaps, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 'user', 'hash', 1, 1, datetime('now'), datetime('now'))`,
        [otherId, 'other@example.com', 'Other']
      )

      await saveModuleQuizAttempt(db, userId, moduleFixture, { 'module-content': -1 })
      await saveModuleQuizAttempt(db, userId, moduleFixture, { 'module-content': 0 })
      await saveModuleQuizAttempt(db, otherId, moduleFixture, { 'module-content': 0 })

      const rows = await listUserQuizAttempts(db, userId)

      expect(rows).toHaveLength(2)
      expect(rows[0].attempt_id).toBeLessThan(rows[1].attempt_id)
      expect(rows[0]).toMatchObject({
        roadmap_id: ROADMAP_ID,
        roadmap_title: 'Roadmap EC2',
        module_id: MODULE_ID,
        module_title: 'EC2',
        quiz_scope: 'module'
      })
      expect(typeof rows[0].submitted_at).toBe('string')
      expect(rows[0].percentage).toBe(Math.round((rows[0].score / rows[0].max_score) * 100))
      expect(await listUserQuizAttempts(db, 999999)).toEqual([])
    })
  })

  it('keeps attempts whose roadmap/module were detached and is exposed by the repository port', async () => {
    await withTempDb('moodle-quiz-export-port-', async db => {
      const { createQuizAttemptRepository } = await import('../lib/domains/progress/repositories/quizRepository')
      const userId = 700012
      await seedRoadmapAndUser(db, userId)
      await db.run(
        `INSERT INTO user_quiz_attempts (user_id, roadmap_id, module_id, quiz_scope, score, max_score, submitted_at, created_at, updated_at)
         VALUES (?, NULL, NULL, 'module', NULL, NULL, '2026-10-20T10:00:00.000Z', '2026-10-20T10:00:00.000Z', '2026-10-20T10:00:00.000Z')`,
        [userId]
      )

      const rows = await createQuizAttemptRepository(db).listForUser(userId)

      expect(rows).toEqual([{
        attempt_id: expect.any(Number),
        roadmap_id: null,
        roadmap_title: null,
        module_id: null,
        module_title: null,
        quiz_scope: 'module',
        score: 0,
        max_score: 0,
        percentage: 0,
        submitted_at: '2026-10-20T10:00:00.000Z'
      }])
    })
  })
})
