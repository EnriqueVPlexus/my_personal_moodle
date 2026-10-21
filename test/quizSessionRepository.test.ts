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

const questions = [
  { id: 'bank-3', type: 'multiple_choice' as const, prompt: 'Q?', options: ['A', 'B'], correct_option_index: 1, explanation: 'why' }
]

// Fixed high ids: a fresh database is already seeded with the default roadmaps.
const ROADMAP = 950001
const M10 = 950010
const M11 = 950011
const U1 = 950101
const U2 = 950102

async function seed(db: any) {
  await db.exec(`
    INSERT INTO roadmaps (id, title) VALUES (${ROADMAP}, 'R');
    INSERT INTO modules (id, roadmap_id, title) VALUES (${M10}, ${ROADMAP}, 'M10'), (${M11}, ${ROADMAP}, 'M11');
  `)
  for (const id of [U1, U2]) {
    await db.run(
      `INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 'user', 'hash', 1, datetime('now'), datetime('now'))`,
      [id, `u${id}@example.com`, `U${id}`]
    )
  }
}

const NOW = '2026-03-01T10:00:00.000Z'
const LATER = '2026-03-02T10:00:00.000Z'
const input = (id: string, over: Record<string, unknown> = {}) => ({
  id, userId: U1, moduleId: M10, questions, createdAt: NOW, expiresAt: LATER, ...over
})

describe('quizSessionRepository (sqlite backend)', () => {
  it('creates a session that round-trips the full question snapshot', async () => {
    await withTempDb('moodle-quiz-session-create-', async db => {
      const { createQuizSessionRepository } = await import('../lib/domains/progress/repositories/quizSessionRepository')
      await seed(db)
      const repo = createQuizSessionRepository(db)

      const created = await repo.create(input('s1'))
      expect(created).toMatchObject({ id: 's1', user_id: U1, module_id: M10, submitted_at: null, expires_at: LATER })

      expect(await repo.findById('s1')).toEqual(created)
      expect((await repo.findById('s1'))!.questions[0].correct_option_index).toBe(1)
      expect(await repo.findById('missing')).toBeNull()
    })
  })

  it('finds the latest open session of the user and module only', async () => {
    await withTempDb('moodle-quiz-session-active-', async db => {
      const { createQuizSessionRepository } = await import('../lib/domains/progress/repositories/quizSessionRepository')
      await seed(db)
      const repo = createQuizSessionRepository(db)

      await repo.create(input('old', { createdAt: '2026-03-01T09:00:00.000Z' }))
      await repo.create(input('new', { createdAt: '2026-03-01T09:30:00.000Z' }))
      await repo.create(input('other-user', { userId: U2 }))
      await repo.create(input('other-module', { moduleId: M11 }))

      expect((await repo.findActive(U1, M10, NOW))?.id).toBe('new')
      expect((await repo.findActive(U2, M10, NOW))?.id).toBe('other-user')
      expect((await repo.findActive(U1, M11, NOW))?.id).toBe('other-module')
      expect(await repo.findActive(U2, M11, NOW)).toBeNull()
    })
  })

  it('ignores submitted and expired sessions', async () => {
    await withTempDb('moodle-quiz-session-closed-', async db => {
      const { createQuizSessionRepository } = await import('../lib/domains/progress/repositories/quizSessionRepository')
      await seed(db)
      const repo = createQuizSessionRepository(db)

      await repo.create(input('s1'))
      expect(await repo.findActive(U1, M10, LATER)).toBeNull()
      expect(await repo.findActive(U1, M10, '2026-03-03T00:00:00.000Z')).toBeNull()

      expect(await repo.markSubmitted('s1', NOW)).toBe(true)
      expect(await repo.findActive(U1, M10, NOW)).toBeNull()
      expect((await repo.findById('s1'))!.submitted_at).toBe(NOW)
    })
  })

  it('marks a session submitted only once', async () => {
    await withTempDb('moodle-quiz-session-once-', async db => {
      const { createQuizSessionRepository } = await import('../lib/domains/progress/repositories/quizSessionRepository')
      await seed(db)
      const repo = createQuizSessionRepository(db)
      await repo.create(input('s1'))

      expect(await repo.markSubmitted('s1', NOW)).toBe(true)
      expect(await repo.markSubmitted('s1', LATER)).toBe(false)
      expect(await repo.markSubmitted('missing', NOW)).toBe(false)
      expect((await repo.findById('s1'))!.submitted_at).toBe(NOW)
    })
  })

  it('removes sessions with their user or module (ON DELETE CASCADE)', async () => {
    await withTempDb('moodle-quiz-session-cascade-', async db => {
      const { createQuizSessionRepository } = await import('../lib/domains/progress/repositories/quizSessionRepository')
      await seed(db)
      const repo = createQuizSessionRepository(db)
      await repo.create(input('by-user', { userId: U2 }))
      await repo.create(input('by-module', { moduleId: M11 }))

      await db.run(`DELETE FROM users WHERE id = ${U2}`)
      await db.run(`DELETE FROM modules WHERE id = ${M11}`)

      expect(await repo.findById('by-user')).toBeNull()
      expect(await repo.findById('by-module')).toBeNull()
    })
  })

  it('stores the attempt id inside the attempt answers JSON', async () => {
    await withTempDb('moodle-quiz-session-attempt-', async db => {
      const { insertModuleQuizAttempt } = await import('../lib/domains/progress/repositories/quizRepository')
      await seed(db)
      const grade = { score: 1, max_score: 1, percentage: 100, passed: true, feedback: [] }

      await insertModuleQuizAttempt(db, U1, { id: M10, roadmap_id: ROADMAP } as any, { 'bank-3': 1 }, grade, 's1')
      await insertModuleQuizAttempt(db, U1, { id: M10, roadmap_id: ROADMAP } as any, { 'bank-3': 1 }, grade)

      const rows = await db.all('SELECT answers FROM user_quiz_attempts ORDER BY id')
      expect(JSON.parse(rows[0].answers)).toMatchObject({ attempt_id: 's1', answers: { 'bank-3': 1 } })
      expect(JSON.parse(rows[1].answers).attempt_id).toBeNull()
    })
  })
})
