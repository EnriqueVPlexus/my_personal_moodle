import { describe, expect, it, vi } from 'vitest'
import { buildModuleProgress } from '../../lib/domains/progress/moduleProgress'
import { resolveRoadmapStatus } from '../../lib/domains/progress/rules'
import { makeProgressService, type ProgressPorts } from '../../lib/domains/progress/service'
import type { ModuleRecord, RoadmapWithCategory } from '../../lib/domains/content/types'
import type { UserPortfolio } from '../../lib/domains/progress/portfolio'

const quizBank = JSON.stringify([
  { question: 'Q1?', answer: 'A', options: ['A', 'B'], explanation: 'e1' },
  { question: 'Q2?', answer: 'B', options: ['A', 'B', 'C'], explanation: 'e2' }
])

function moduleRecord(overrides: Partial<ModuleRecord> = {}): ModuleRecord {
  return {
    id: 7, roadmap_id: 4, position: 1, title: 'Docker', duration: null, duration_weeks_min: null,
    duration_weeks_max: null, level: null, objective: null, contents: null, importance: null,
    official_resources: null, support_videos: null, practical_activity: null, deliverable_evidence: null,
    evaluation: null, quiz_bank: quizBank, quiz_pass_percentage: null, quiz_max_attempts: null,
    quiz_cooldown_minutes: null, ...overrides
  }
}

type Overrides = { [K in keyof ProgressPorts]?: Partial<ProgressPorts[K]> }

function setup(overrides: Overrides = {}) {
  const missing = (name: string) => () => { throw new Error(`unexpected call: ${name}`) }
  const proxy = <K extends keyof ProgressPorts>(group: K): ProgressPorts[K] =>
    new Proxy((overrides[group] ?? {}) as object, {
      get: (target, prop: string) => (target as Record<string, unknown>)[prop] ?? missing(`${group}.${prop}`)
    }) as ProgressPorts[K]

  const progress = proxy('progress')
  const quizAttempts = proxy('quizAttempts')
  const evidences = proxy('evidences')

  return makeProgressService({
    progress,
    learnerViews: proxy('learnerViews'),
    quizAttempts,
    evidences,
    portfolios: proxy('portfolios'),
    content: proxy('content'),
    unitOfWork: { run: overrides.unitOfWork?.run ?? (work => work({ progress, quizAttempts, evidences })) }
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

describe('quiz attempt flow', () => {
  const eligible = { allowed: true, pass_percentage: 70 }

  function quizPorts(overrides: { eligibility?: object; module?: ModuleRecord | undefined; unitOfWork?: Overrides['unitOfWork'] } = {}) {
    const save = vi.fn(async (_userId: number, _module: unknown, _answers: unknown, grade: object) => ({
      ...grade, submitted_at: '2026-01-01T00:00:00.000Z'
    }))
    const touch = vi.fn().mockResolvedValue(undefined)
    const service = setup({
      content: { findModule: async () => ('module' in overrides ? overrides.module : moduleRecord()) },
      progress: { touchRoadmapProgress: touch },
      quizAttempts: {
        checkEligibility: async () => (overrides.eligibility ?? eligible) as never,
        getSummary: async () => ({ attempts_count: 1 }),
        save: save as never
      },
      ...(overrides.unitOfWork ? { unitOfWork: overrides.unitOfWork } : {})
    })
    return { service, save, touch }
  }

  it('reports a missing module', async () => {
    const { service } = quizPorts({ module: undefined })
    expect(await service.submitQuizAttempt(2, 7, {})).toEqual({ status: 'not_found' })
  })

  it('blocks attempts that are not eligible before grading (429 case)', async () => {
    const eligibility = { allowed: false, cooldown_ends_at: '2026-01-02T00:00:00.000Z', pass_percentage: 70 }
    const { service, save } = quizPorts({ eligibility })

    expect(await service.submitQuizAttempt(2, 7, { 'bank-0': 0, 'bank-1': 1 })).toEqual({ status: 'not_eligible', eligibility })
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
    ['an option out of range', { 'bank-0': 2, 'bank-1': 1 }],
    ['a fractional option', { 'bank-0': 0.5, 'bank-1': 1 }]
  ])('rejects %s (400 case)', async (_label, answers) => {
    const { service, save } = quizPorts()
    expect(await service.submitQuizAttempt(2, 7, answers)).toEqual({ status: 'invalid_answers' })
    expect(save).not.toHaveBeenCalled()
  })

  it('grades valid answers, stores the attempt and touches the roadmap progress', async () => {
    const { service, save, touch } = quizPorts()

    const outcome = await service.submitQuizAttempt(2, 7, { 'bank-0': 0, 'bank-1': 0 })

    if (outcome.status !== 'ok') throw new Error(`unexpected ${outcome.status}`)
    expect(outcome.attempt).toMatchObject({ score: 1, max_score: 2, percentage: 50, passed: false })
    expect(save).toHaveBeenCalledWith(2, expect.objectContaining({ id: 7 }), { 'bank-0': 0, 'bank-1': 0 }, expect.objectContaining({ score: 1 }))
    expect(touch).toHaveBeenCalledWith({ userId: 2, roadmapId: 4, moduleId: 7 })
    expect(outcome.summary).toEqual({ attempts_count: 1 })
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
            progress: { touchRoadmapProgress: async () => { throw failure } }
          })
        }) as any
      }
    })

    await expect(service.submitQuizAttempt(2, 7, { 'bank-0': 0, 'bank-1': 0 })).rejects.toBe(failure)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('only attaches summary and eligibility for signed-in readers', async () => {
    const { service } = quizPorts()
    const anonymous = await service.getModuleQuiz(null, 7)
    expect(anonymous).toMatchObject({ summary: null, eligibility: null })
    expect(JSON.stringify(anonymous)).not.toContain('correct_option_index')

    expect(await service.getModuleQuiz(2, 7)).toMatchObject({ summary: { attempts_count: 1 }, eligibility: eligible })
  })
})

describe('learner views', () => {
  it('hides a module from learners whose scope excludes its roadmap', async () => {
    const touch = vi.fn()
    const service = setup({
      content: { findModule: async () => moduleRecord() },
      progress: { touchRoadmapProgress: touch }
    })

    expect(await service.getModuleDetail({ user: { id: 2 }, allRoadmaps: false, roadmapIds: [9] }, 7)).toBeNull()
    expect(touch).not.toHaveBeenCalled()
  })

  it('builds the module detail with progress and a public quiz for signed-in learners', async () => {
    const service = setup({
      content: { findModule: async () => moduleRecord() },
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
  })

  it('gives anonymous readers the module without progress or summary', async () => {
    const service = setup({
      content: { findModule: async () => moduleRecord() },
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
