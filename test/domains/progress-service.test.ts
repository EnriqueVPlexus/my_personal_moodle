import { describe, expect, it, vi } from 'vitest'
import { buildModuleProgress } from '../../lib/domains/progress/moduleProgress'
import { resolveRoadmapStatus } from '../../lib/domains/progress/rules'
import { buildModuleQuiz } from '../../lib/domains/content/quizzes'
import { makeProgressService, QUIZ_SESSION_TTL_MS, type ProgressPorts } from '../../lib/domains/progress/service'
import type { QuizAttemptSession, QuizSessionRepository } from '../../lib/domains/progress/ports'
import type { ModuleWithQuizBank, RoadmapWithCategory } from '../../lib/domains/content/types'
import type { UserPortfolio } from '../../lib/domains/progress/portfolio'

const quizBank = JSON.stringify([
  { question: 'Q1?', answer: 'A', options: ['A', 'B'], explanation: 'e1' },
  { question: 'Q2?', answer: 'B', options: ['A', 'B', 'C'], explanation: 'e2' }
])

function moduleRecord(overrides: Partial<ModuleWithQuizBank> = {}): ModuleWithQuizBank {
  return {
    id: 7, roadmap_id: 4, position: 1, title: 'Docker', duration: null, duration_weeks_min: null,
    duration_weeks_max: null, level: null, objective: null, contents: null, importance: null,
    official_resources: null, support_videos: null, practical_activity: null, deliverable_evidence: null,
    evaluation: null, quiz_bank: quizBank, quiz_pass_percentage: null, quiz_max_attempts: null,
    quiz_cooldown_minutes: null, ...overrides
  }
}

type Overrides = { [K in keyof ProgressPorts]?: Partial<ProgressPorts[K]> }

type Seams = { clock?: () => Date; newId?: () => string; random?: () => number }

function setup(overrides: Overrides = {}, seams: Seams = {}) {
  const missing = (name: string) => () => { throw new Error(`unexpected call: ${name}`) }
  const proxy = <K extends keyof ProgressPorts>(group: K): ProgressPorts[K] =>
    new Proxy((overrides[group] ?? {}) as object, {
      get: (target, prop: string) => (target as Record<string, unknown>)[prop] ?? missing(`${group}.${prop}`)
    }) as ProgressPorts[K]

  const progress = proxy('progress')
  const quizAttempts = proxy('quizAttempts')
  const quizSessions = proxy('quizSessions')
  const evidences = proxy('evidences')

  return makeProgressService({
    progress,
    learnerViews: proxy('learnerViews'),
    quizAttempts,
    quizSessions,
    evidences,
    portfolios: proxy('portfolios'),
    content: proxy('content'),
    unitOfWork: { run: overrides.unitOfWork?.run ?? (work => work({ progress, quizAttempts, quizSessions, evidences })) },
    ...seams
  })
}

const everything = { user: { id: 2 }, allRoadmaps: true, roadmapIds: [] as number[] }

describe('module progress calculation', () => {
  it('is not started for a module without lessons that was never opened', () => {
    expect(buildModuleProgress([], false)).toMatchObject({
      total_lessons: 0, progress_percentage: 0, status: 'not_started', next_lesson_id: null
    })
  })

  it('counts completed lessons, the next pending lesson and accumulated time', () => {
    const progress = buildModuleProgress([
      { id: 1, title: 'A', completed: 1, progress_time_spent_seconds: 60 },
      { id: 2, title: 'B', completed: 0, progress_time_spent_seconds: 30 },
      { id: 3, title: 'C', completed: 0, progress_time_spent_seconds: null }
    ], false)

    expect(progress).toEqual({
      total_lessons: 3,
      completed_lessons_count: 1,
      progress_percentage: 33,
      status: 'in_progress',
      next_lesson_id: 2,
      next_lesson_title: 'B',
      time_spent_seconds: 90
    })
  })

  it('is in progress when the module was opened and completed when every lesson is done', () => {
    expect(buildModuleProgress([{ id: 1, title: 'A', completed: 0 }], true).status).toBe('in_progress')
    expect(buildModuleProgress([{ id: 1, title: 'A', completed: 1 }], true)).toMatchObject({
      status: 'completed', progress_percentage: 100, next_lesson_id: null
    })
  })

  it('resolves roadmap status from lessons, current module and inactivity', () => {
    const base = { completedLessonsCount: 0, totalLessons: 4 }
    expect(resolveRoadmapStatus(base)).toBe('started')
    expect(resolveRoadmapStatus({ ...base, completedLessonsCount: 1, lastActivityAt: new Date().toISOString() })).toBe('in_progress')
    expect(resolveRoadmapStatus({ ...base, completedLessonsCount: 1, lastActivityAt: '2020-01-01T00:00:00.000Z' })).toBe('paused')
    expect(resolveRoadmapStatus({ completedLessonsCount: 4, totalLessons: 4 })).toBe('completed')
  })
})

/** In-memory sessions with the same contract as the SQL repositories. */
function fakeSessions(): { rows: Map<string, QuizAttemptSession>; repo: QuizSessionRepository } {
  const rows = new Map<string, QuizAttemptSession>()
  const repo: QuizSessionRepository = {
    findActive: async (userId, moduleId, now) => [...rows.values()]
      .filter(row => row.user_id === userId && row.module_id === moduleId && row.submitted_at === null && row.expires_at > now)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
    create: async input => {
      const row: QuizAttemptSession = {
        id: input.id, user_id: input.userId, module_id: input.moduleId, questions: input.questions,
        created_at: input.createdAt, expires_at: input.expiresAt, submitted_at: null
      }
      rows.set(row.id, row)
      return row
    },
    findById: async id => rows.get(id) ?? null,
    markSubmitted: async (id, submittedAt) => {
      const row = rows.get(id)
      if (!row || row.submitted_at !== null) return false
      row.submitted_at = submittedAt
      return true
    }
  }
  return { rows, repo }
}

/** Deterministic pseudo random source so selections are reproducible. */
function lcg(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

describe('quiz attempt flow', () => {
  const eligible = { allowed: true, pass_percentage: 70 }
  const NOW = new Date('2026-03-01T10:00:00.000Z')

  const bigBank = JSON.stringify(Array.from({ length: 9 }, (_v, i) => ({
    question: `Q${i}?`, answer: `A${i}`, options: [`A${i}`, `B${i}`, `C${i}`], explanation: `e${i}`
  })))

  function quizPorts(overrides: {
    eligibility?: object
    module?: ModuleWithQuizBank | undefined
    unitOfWork?: Overrides['unitOfWork']
    clock?: () => Date
  } = {}) {
    const save = vi.fn(async (_userId: number, _module: unknown, _answers: unknown, grade: object, _attemptId?: string | null) => ({
      ...grade, submitted_at: '2026-01-01T00:00:00.000Z'
    }))
    const touch = vi.fn().mockResolvedValue(undefined)
    const sessions = fakeSessions()
    let nextId = 0
    const service = setup({
      content: { findModuleWithQuizBank: async () => ('module' in overrides ? overrides.module : moduleRecord()) },
      progress: { touchRoadmapProgress: touch },
      quizAttempts: {
        checkEligibility: async () => (overrides.eligibility ?? eligible) as never,
        getSummary: async () => ({ attempts_count: 1 }),
        save: save as never
      },
      quizSessions: sessions.repo,
      ...(overrides.unitOfWork ? { unitOfWork: overrides.unitOfWork } : {})
    }, {
      clock: overrides.clock ?? (() => NOW),
      newId: () => `session-${++nextId}`,
      random: lcg(42)
    })
    return { service, save, touch, sessions }
  }

  /** Answers every served question with its correct option, read from the stored snapshot. */
  function correctAnswers(session: QuizAttemptSession) {
    return Object.fromEntries(session.questions.map(q => [q.id, q.correct_option_index]))
  }

  describe('serving a quiz', () => {
    it('gives anonymous readers the stable preview without touching sessions', async () => {
      const { service, sessions } = quizPorts()
      const anonymous = await service.getModuleQuiz(null, 7)

      expect(anonymous).toMatchObject({ attempt_id: null, summary: null, eligibility: null })
      expect(anonymous?.quiz).toEqual(JSON.parse(JSON.stringify(anonymous?.quiz)))
      expect(JSON.stringify(anonymous)).not.toContain('correct_option_index')
      expect(sessions.rows.size).toBe(0)
    })

    it('creates a session with a random subset of the bank for a learner and never leaks the answers', async () => {
      const { service, sessions } = quizPorts({ module: moduleRecord({ quiz_bank: bigBank }) })

      const result = await service.getModuleQuiz(2, 7)

      expect(result).toMatchObject({ attempt_id: 'session-1', summary: { attempts_count: 1 }, eligibility: eligible })
      expect(result?.quiz.questions).toHaveLength(5)
      const stored = sessions.rows.get('session-1')!
      expect(stored.expires_at).toBe(new Date(NOW.getTime() + QUIZ_SESSION_TTL_MS).toISOString())
      expect(stored.questions.map(q => q.id)).toEqual(result?.quiz.questions.map(q => q.id))
      expect(JSON.stringify(result)).not.toContain('correct_option_index')
    })

    it('reuses the active session so reloading does not re-roll the questions', async () => {
      const { service, sessions } = quizPorts({ module: moduleRecord({ quiz_bank: bigBank }) })

      const first = await service.getModuleQuiz(2, 7)
      const second = await service.getModuleQuiz(2, 7)

      expect(second?.attempt_id).toBe(first?.attempt_id)
      expect(second?.quiz).toEqual(first?.quiz)
      expect(sessions.rows.size).toBe(1)
    })

    it('starts a new session once the previous one was submitted or expired', async () => {
      let current = NOW
      const { service, sessions } = quizPorts({ module: moduleRecord({ quiz_bank: bigBank }), clock: () => current })

      const first = await service.getModuleQuiz(2, 7)
      sessions.rows.get(first!.attempt_id!)!.submitted_at = NOW.toISOString()
      const afterSubmit = await service.getModuleQuiz(2, 7)
      expect(afterSubmit?.attempt_id).toBe('session-2')

      current = new Date(NOW.getTime() + QUIZ_SESSION_TTL_MS + 1)
      const afterExpiry = await service.getModuleQuiz(2, 7)
      expect(afterExpiry?.attempt_id).toBe('session-3')
    })

    it('keeps sessions per learner and per module', async () => {
      const { service } = quizPorts({ module: moduleRecord({ quiz_bank: bigBank }) })
      const ana = await service.getModuleQuiz(2, 7)
      const luis = await service.getModuleQuiz(3, 7)
      expect(luis?.attempt_id).not.toBe(ana?.attempt_id)
    })

    it('serves a deterministic quiz through a session when the module has no bank', async () => {
      const generated = moduleRecord({ quiz_bank: null, contents: '["AMI"]', practical_activity: '["Crear"]' })
      const { service, sessions } = quizPorts({ module: generated })

      const result = await service.getModuleQuiz(2, 7)

      expect(result?.attempt_id).toBe('session-1')
      expect(result?.quiz.questions.map(q => q.id)).toEqual(buildModuleQuiz(generated).questions.map(q => q.id))
      expect(sessions.rows.size).toBe(1)
    })

    it('does not create a session when there is nothing to serve', async () => {
      const { service, sessions } = quizPorts({ module: moduleRecord({ quiz_bank: null }) })
      const result = await service.getModuleQuiz(2, 7)
      expect(result).toMatchObject({ attempt_id: null, quiz: { questions: [] } })
      expect(sessions.rows.size).toBe(0)
    })

    it('reports a missing module', async () => {
      const { service } = quizPorts({ module: undefined })
      expect(await service.getModuleQuiz(2, 7)).toBeNull()
    })
  })

  describe('submitting an attempt', () => {
    it('reports a missing module', async () => {
      const { service } = quizPorts({ module: undefined })
      expect(await service.submitQuizAttempt(2, 7, {})).toEqual({ status: 'not_found' })
    })

    it('blocks attempts that are not eligible before looking at the session (429 case)', async () => {
      const eligibility = { allowed: false, cooldown_ends_at: '2026-01-02T00:00:00.000Z', pass_percentage: 70 }
      const { service, save } = quizPorts({ eligibility })

      expect(await service.submitQuizAttempt(2, 7, { 'bank-0': 0, 'bank-1': 1 }, 'unknown-id')).toEqual({ status: 'not_eligible', eligibility })
      expect(save).not.toHaveBeenCalled()
    })

    it('rejects modules without questions (422 case)', async () => {
      const { service, save } = quizPorts({ module: moduleRecord({ quiz_bank: '[]' }) })
      expect(await service.submitQuizAttempt(2, 7, {})).toEqual({ status: 'no_questions' })
      expect(save).not.toHaveBeenCalled()
    })

    it.each([
      ['a missing answer', { 'bank-0': 0 }],
      ['a non numeric answer', { 'bank-0': '0', 'bank-1': 1 }],
      ['a negative option', { 'bank-0': -1, 'bank-1': 1 }],
      ['an option out of range', { 'bank-0': 5, 'bank-1': 1 }],
      ['a fractional option', { 'bank-0': 0.5, 'bank-1': 1 }],
      ['answers for questions the attempt did not serve', { 'bank-7': 0, 'bank-8': 0 }]
    ])('rejects %s (400 case)', async (_label, answers) => {
      const { service, save, sessions } = quizPorts()
      const served = (await service.getModuleQuiz(2, 7))!
      const outcome = await service.submitQuizAttempt(2, 7, answers, served.attempt_id!)

      expect(outcome).toEqual({ status: 'invalid_answers' })
      expect(save).not.toHaveBeenCalled()
      expect(sessions.rows.get(served.attempt_id!)!.submitted_at).toBeNull()
    })

    it('grades against the session snapshot, stores the attempt with its id and touches the roadmap progress', async () => {
      const { service, save, touch, sessions } = quizPorts()
      const served = (await service.getModuleQuiz(2, 7))!
      const answers = correctAnswers(sessions.rows.get(served.attempt_id!)!)

      const outcome = await service.submitQuizAttempt(2, 7, answers, served.attempt_id!)

      if (outcome.status !== 'ok') throw new Error(`unexpected ${outcome.status}`)
      expect(outcome.attemptId).toBe('session-1')
      expect(outcome.attempt).toMatchObject({ score: 2, max_score: 2, percentage: 100, passed: true })
      expect(save).toHaveBeenCalledWith(2, expect.objectContaining({ id: 7 }), answers, expect.objectContaining({ score: 2 }), 'session-1')
      expect(touch).toHaveBeenCalledWith({ userId: 2, roadmapId: 4, moduleId: 7 })
      expect(outcome.summary).toEqual({ attempts_count: 1 })
      expect(sessions.rows.get('session-1')!.submitted_at).toBe(NOW.toISOString())
    })

    it('still grades an open session after the bank was edited', async () => {
      const { service, sessions } = quizPorts({ module: moduleRecord({ quiz_bank: bigBank }) })
      const served = (await service.getModuleQuiz(2, 7))!
      const snapshot = sessions.rows.get(served.attempt_id!)!
      const answers = correctAnswers(snapshot)
      // A different service instance over the same sessions sees a rewritten bank.
      const edited = setup({
        content: { findModuleWithQuizBank: async () => moduleRecord({ quiz_bank: JSON.stringify([{ question: 'New?', answer: 'x', options: ['x', 'y'] }]) }) },
        progress: { touchRoadmapProgress: async () => undefined },
        quizAttempts: {
          checkEligibility: async () => eligible as never,
          getSummary: async () => ({ attempts_count: 1 }),
          save: (async (_u: number, _m: unknown, _a: unknown, grade: object) => ({ ...grade, submitted_at: 'now' })) as never
        },
        quizSessions: sessions.repo
      }, { clock: () => NOW })

      const outcome = await edited.submitQuizAttempt(2, 7, answers, served.attempt_id!)

      expect(outcome).toMatchObject({ status: 'ok', attempt: { score: 5, max_score: 5 } })
    })

    it.each([
      ['an unknown id', (_s: ReturnType<typeof fakeSessions>) => 'does-not-exist', 2],
      ['a session of another learner', (_s: ReturnType<typeof fakeSessions>) => 'session-1', 3],
      ['an already submitted session', (s: ReturnType<typeof fakeSessions>) => { s.rows.get('session-1')!.submitted_at = NOW.toISOString(); return 'session-1' }, 2],
      ['an expired session', (s: ReturnType<typeof fakeSessions>) => { s.rows.get('session-1')!.expires_at = new Date(NOW.getTime() - 1).toISOString(); return 'session-1' }, 2],
      ['a session of another module', (s: ReturnType<typeof fakeSessions>) => { s.rows.get('session-1')!.module_id = 99; return 'session-1' }, 2]
    ])('answers session_unavailable for %s (409 case)', async (_label, arrange, userId) => {
      const { service, save, sessions } = quizPorts()
      const served = (await service.getModuleQuiz(2, 7))!
      const answers = correctAnswers(sessions.rows.get(served.attempt_id!)!)
      const attemptId = arrange(sessions)

      expect(await service.submitQuizAttempt(userId, 7, answers, attemptId)).toEqual({ status: 'session_unavailable' })
      expect(save).not.toHaveBeenCalled()
    })

    it('saves only one attempt when the same session is submitted twice', async () => {
      const { service, save, sessions } = quizPorts()
      const served = (await service.getModuleQuiz(2, 7))!
      const answers = correctAnswers(sessions.rows.get(served.attempt_id!)!)

      const first = await service.submitQuizAttempt(2, 7, answers, served.attempt_id!)
      const second = await service.submitQuizAttempt(2, 7, answers, served.attempt_id!)

      expect(first.status).toBe('ok')
      expect(second).toEqual({ status: 'session_unavailable' })
      expect(save).toHaveBeenCalledTimes(1)
    })

    it('aborts without saving when a concurrent submit closes the session first', async () => {
      const { service, save, touch, sessions } = quizPorts()
      const served = (await service.getModuleQuiz(2, 7))!
      const answers = correctAnswers(sessions.rows.get(served.attempt_id!)!)
      // The conditional close loses the race: another request already submitted.
      sessions.repo.markSubmitted = async () => false

      expect(await service.submitQuizAttempt(2, 7, answers, served.attempt_id!)).toEqual({ status: 'session_unavailable' })
      expect(save).not.toHaveBeenCalled()
      expect(touch).not.toHaveBeenCalled()
    })

    it('legacy clients without attempt_id are graded against the deterministic quiz and never touch sessions', async () => {
      const { service, save, sessions } = quizPorts()
      // An open session exists, but the legacy path must ignore it.
      const served = (await service.getModuleQuiz(2, 7))!
      const deterministic = buildModuleQuiz(moduleRecord())
      const answers = Object.fromEntries(deterministic.questions.map(q => [q.id, q.correct_option_index]))

      const outcome = await service.submitQuizAttempt(2, 7, answers)

      expect(outcome).toMatchObject({ status: 'ok', attemptId: null, attempt: { score: 2, max_score: 2 } })
      expect(save).toHaveBeenCalledWith(2, expect.anything(), answers, expect.anything(), null)
      expect(sessions.rows.get(served.attempt_id!)!.submitted_at).toBeNull()
    })

    it('saves the attempt and touches progress in one unit of work, propagating a failed touch', async () => {
      const failure = new Error('touch failed')
      const run = vi.fn()
      const { service } = quizPorts({
        unitOfWork: {
          run: (async (work: (repos: any) => Promise<unknown>) => {
            run()
            return work({
              quizAttempts: { save: async () => ({ score: 1, max_score: 2, percentage: 50, passed: false, submitted_at: 'now' }) },
              quizSessions: { markSubmitted: async () => true },
              progress: { touchRoadmapProgress: async () => { throw failure } }
            })
          }) as any
        }
      })
      const served = (await service.getModuleQuiz(2, 7))!

      await expect(service.submitQuizAttempt(2, 7, { 'bank-0': 0, 'bank-1': 0 }, served.attempt_id!)).rejects.toBe(failure)
      expect(run).toHaveBeenCalledTimes(1)
    })
  })
})

describe('learner views', () => {
  it('hides a module from learners whose scope excludes its roadmap', async () => {
    const touch = vi.fn()
    const service = setup({
      content: { findModuleWithQuizBank: async () => moduleRecord() },
      progress: { touchRoadmapProgress: touch }
    })

    expect(await service.getModuleDetail({ user: { id: 2 }, allRoadmaps: false, roadmapIds: [9] }, 7)).toBeNull()
    expect(touch).not.toHaveBeenCalled()
  })

  it('builds the module detail with progress and a public quiz for signed-in learners', async () => {
    const service = setup({
      content: { findModuleWithQuizBank: async () => moduleRecord() },
      progress: { touchRoadmapProgress: async () => undefined },
      learnerViews: { listModuleLessons: async () => [{ id: 1, title: 'A', completed: 1, progress_time_spent_seconds: 10 }] },
      quizAttempts: { getSummary: async () => ({ attempts_count: 0 }) }
    })

    const detail = await service.getModuleDetail(everything, 7)

    expect(detail).toMatchObject({
      id: 7,
      progress: { status: 'completed', progress_percentage: 100 },
      quiz_summary: { attempts_count: 0 }
    })
    expect(JSON.stringify(detail?.quiz)).not.toContain('correct_option_index')
    expect(JSON.stringify(detail)).not.toContain('quiz_bank')
    expect(JSON.stringify(detail)).not.toContain('correct_option_index')
  })

  it('gives anonymous readers the module without progress or summary', async () => {
    const service = setup({
      content: { findModuleWithQuizBank: async () => moduleRecord() },
      learnerViews: { listModuleLessons: async () => [] }
    })

    expect(await service.getModuleDetail({ user: null, allRoadmaps: true, roadmapIds: [] }, 7))
      .toMatchObject({ progress: null, quiz_summary: null, lessons: [] })
  })

  it('merges per-module progress into the roadmap detail and flattens the category', async () => {
    const roadmap = {
      id: 4, title: 'AWS', category_key: 'cloud', category_label: 'Cloud'
    } as unknown as RoadmapWithCategory
    const service = setup({
      content: { findRoadmap: async () => roadmap, getRoadmapTopics: async () => [{ key: 'aws', label: 'AWS' }] },
      progress: {
        touchRoadmapProgress: async () => undefined,
        getRoadmapDetailProgress: async () => ({ modules: [{ module_id: 7, status: 'completed' }] }) as never
      },
      learnerViews: { listRoadmapModules: async () => [{ id: 7, title: 'Docker' }, { id: 8, title: 'K8s' }] }
    })

    const detail = await service.getRoadmapDetail(everything, 4)

    expect(detail).toMatchObject({
      id: 4,
      category: { key: 'cloud', label: 'Cloud' },
      topics: [{ key: 'aws', label: 'AWS' }]
    })
    expect(detail).not.toHaveProperty('category_key')
    expect(detail?.modules).toEqual([
      { id: 7, title: 'Docker', progress: { module_id: 7, status: 'completed' } },
      { id: 8, title: 'K8s', progress: null }
    ])
  })

  it('returns null for roadmaps outside the scope without reading them', async () => {
    const service = setup()
    expect(await service.getRoadmapDetail({ user: null, allRoadmaps: false, roadmapIds: [1] }, 4)).toBeNull()
  })
})

describe('evidence flows', () => {
  const input = { evidenceType: 'note' as const, url: null, note: 'Hecho' }

  it('loads the scope only after the module exists and honors it', async () => {
    const loadScope = vi.fn().mockResolvedValue({ user: { id: 2 }, allRoadmaps: false, roadmapIds: [9] })
    const save = vi.fn()
    const service = setup({
      content: { findModule: async (id: number) => (id === 7 ? moduleRecord() : undefined) },
      evidences: { save, delete: async () => 1 }
    })

    expect(await service.saveModuleEvidence(2, 999, input, loadScope)).toBeNull()
    expect(loadScope).not.toHaveBeenCalled()

    expect(await service.saveModuleEvidence(2, 7, input, loadScope)).toBeNull()
    expect(await service.deleteModuleEvidence(2, 7, loadScope)).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })

  it('saves the evidence and touches progress when the scope allows the roadmap', async () => {
    const touch = vi.fn().mockResolvedValue(undefined)
    const service = setup({
      content: { findModule: async () => moduleRecord() },
      evidences: { save: async () => ({ id: 1 }) as never, delete: async () => 0 },
      progress: { touchRoadmapProgress: touch }
    })
    const loadScope = async () => everything

    expect(await service.saveModuleEvidence(2, 7, input, loadScope)).toEqual({ evidence: { id: 1 } })
    expect(touch).toHaveBeenCalledWith({ userId: 2, roadmapId: 4, moduleId: 7 })
    expect(await service.deleteModuleEvidence(2, 7, loadScope)).toBe(false)
  })

  it('reads evidence only for visible modules', async () => {
    const service = setup({
      content: { findModule: async () => moduleRecord() },
      evidences: { get: async () => ({ id: 3 }) as never }
    })

    expect(await service.getModuleEvidence(everything, 2, 7)).toEqual({ evidence: { id: 3 } })
    expect(await service.getModuleEvidence({ user: { id: 2 }, allRoadmaps: false, roadmapIds: [] }, 2, 7)).toBeNull()
  })

  it('returns the previous and updated evidence on review, or null when missing', async () => {
    const review = vi.fn()
      .mockResolvedValueOnce({ id: 5, review_status: 'aprobado' })
      .mockResolvedValueOnce(null)
    const service = setup({
      evidences: { getById: async () => ({ id: 5, review_status: 'pendiente' }) as never, review }
    })

    expect(await service.reviewEvidence(5, 1, { reviewStatus: 'aprobado' })).toEqual({
      previous: { id: 5, review_status: 'pendiente' },
      updated: { id: 5, review_status: 'aprobado' }
    })
    expect(await service.reviewEvidence(5, 1, { reviewStatus: 'aprobado' })).toBeNull()
  })
})

describe('portfolio', () => {
  it('delegates to the portfolio port and renders Markdown', async () => {
    const portfolio: UserPortfolio = {
      user: { id: 2, name: 'Ana', email: 'ana@example.com' },
      total_evidences: 0,
      approved_evidences: 0,
      roadmaps: []
    }
    const service = setup({ portfolios: { getForUser: async () => portfolio } })

    expect(await service.getPortfolio(2)).toBe(portfolio)
    expect(service.exportPortfolioMarkdown(portfolio)).toContain('# Portfolio de Evidencias - Ana')
  })
})
