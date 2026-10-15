import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { methodsByPath, operations } from '../lib/contracts'
import { createRequest, createResponse } from './helpers/api'
import * as fx from './helpers/contractFixtures'

/**
 * Contract tests: every handler runs with mocked services, and the body it
 * writes must parse against the schema the registry declares for that status.
 * Auth, origin and rate limit run for real (lib/http) over a mocked auth service.
 */

const state = vi.hoisted(() => ({
  auth: {} as Record<string, any>,
  audit: {} as Record<string, any>,
  services: {} as Record<string, any>
}))

vi.mock('../lib/persistence', () => ({ openDb: vi.fn(async () => ({})) }))
vi.mock('../lib/container', () => ({ createServices: () => state.services }))
vi.mock('../lib/domains/auth', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/domains/auth')>()),
  createAuthService: () => state.auth
}))
vi.mock('../lib/domains/audit', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/domains/audit')>()),
  createAuditService: () => state.audit
}))

const handlers: Record<string, () => Promise<{ default: (req: any, res: any) => unknown }>> = {
  '/api/admin/dashboard': () => import('../pages/api/admin/dashboard'),
  '/api/audit-logs': () => import('../pages/api/audit-logs/index'),
  '/api/auth/login': () => import('../pages/api/auth/login'),
  '/api/auth/logout': () => import('../pages/api/auth/logout'),
  '/api/auth/me': () => import('../pages/api/auth/me'),
  '/api/auth/setup-status': () => import('../pages/api/auth/setup-status'),
  '/api/auth/setup': () => import('../pages/api/auth/setup'),
  '/api/evidences': () => import('../pages/api/evidences/index'),
  '/api/evidences/{id}/review': () => import('../pages/api/evidences/[id]/review'),
  '/api/evidences/modules/{id}': () => import('../pages/api/evidences/modules/[id]'),
  '/api/lessons': () => import('../pages/api/lessons/index'),
  '/api/lessons/{id}': () => import('../pages/api/lessons/[id]'),
  '/api/modules': () => import('../pages/api/modules/index'),
  '/api/modules/{id}': () => import('../pages/api/modules/[id]'),
  '/api/openapi.json': () => import('../pages/api/openapi.json'),
  '/api/portfolio': () => import('../pages/api/portfolio/index'),
  '/api/portfolio/export': () => import('../pages/api/portfolio/export'),
  '/api/progress/lessons/{id}': () => import('../pages/api/progress/lessons/[id]'),
  '/api/progress/roadmaps': () => import('../pages/api/progress/roadmaps'),
  '/api/quizzes/modules/{id}': () => import('../pages/api/quizzes/modules/[id]'),
  '/api/roadmaps': () => import('../pages/api/roadmaps/index'),
  '/api/roadmaps/{id}': () => import('../pages/api/roadmaps/[id]'),
  '/api/roadmaps/{id}/export': () => import('../pages/api/roadmaps/[id]/export'),
  '/api/roadmaps/import': () => import('../pages/api/roadmaps/import'),
  '/api/roadmaps/metadata': () => import('../pages/api/roadmaps/metadata'),
  '/api/users': () => import('../pages/api/users/index'),
  '/api/users/{id}': () => import('../pages/api/users/[id]')
}

type Role = 'admin' | 'user' | null
const COOKIE = { cookie: 'moodle_session=test-token' }

function arrangeSession(role: Role, options: { readRequired?: boolean; restrictedScope?: boolean } = {}) {
  const user = role === 'admin' ? fx.admin : fx.learner
  const scope = options.restrictedScope
    ? { user, allRoadmaps: false, roadmapIds: [] as number[] }
    : { user: role ? user : null, allRoadmaps: true, roadmapIds: [] as number[] }

  state.auth = {
    authenticate: vi.fn(async () => (role ? user : null)),
    authorize: vi.fn(async (_token: string, required: 'admin' | 'user') => {
      if (!role) return { ok: false, reason: 'unauthenticated' }
      if (required === 'admin' && role !== 'admin') return { ok: false, reason: 'forbidden' }
      return { ok: true, value: user }
    }),
    authorizeRead: vi.fn(async () => (options.readRequired && !role ? { ok: false, reason: 'unauthenticated' } : { ok: true, value: null })),
    resolveReadScope: vi.fn(async () => (options.readRequired && !role ? { ok: false, reason: 'unauthenticated' } : { ok: true, value: scope })),
    login: vi.fn(async () => ({ ok: true, user: { id: 2, email: 'ana@example.com', name: 'Ana', role: 'user' } })),
    needsSetup: vi.fn(async () => true),
    createFirstAdmin: vi.fn(async () => ({ status: 'created', userId: 1 })),
    startSession: vi.fn(async () => ({ token: 'new-token', maxAgeSeconds: 60 })),
    endSession: vi.fn(async () => undefined),
    registerAttempt: vi.fn(async () => ({ allowed: true })),
    clearAttempts: vi.fn(async () => undefined)
  }
  return role ? { headers: COOKIE } : { headers: {} }
}

function arrangeServices() {
  state.audit = { record: vi.fn(async () => undefined), list: vi.fn(async () => [fx.auditEntry]) }
  state.services = {
    content: {
      searchCatalog: vi.fn(async () => [fx.catalogRoadmap]),
      getCatalogMetadata: vi.fn(async () => fx.catalogMetadata),
      createRoadmap: vi.fn(async () => ({ id: 1, roadmap: fx.roadmapRecord, topics: ['AWS'] })),
      updateRoadmap: vi.fn(async () => ({ roadmap: fx.roadmapRecord, topics: ['AWS'] })),
      deleteRoadmap: vi.fn(async () => ({ title: 'AWS' })),
      listModules: vi.fn(async () => [fx.moduleRecord]),
      createModule: vi.fn(async () => ({ id: 3, module: fx.moduleRecord })),
      updateModule: vi.fn(async () => ({ module: fx.moduleRecord })),
      deleteModule: vi.fn(async () => fx.moduleRecord),
      listLessons: vi.fn(async () => [fx.lessonRecord]),
      getLesson: vi.fn(async () => fx.lessonRecord),
      createLesson: vi.fn(async () => ({ id: 7, lesson: fx.lessonRecord })),
      updateLesson: vi.fn(async () => ({ lesson: fx.lessonRecord })),
      deleteLesson: vi.fn(async () => fx.lessonRecord),
      findImportTarget: vi.fn(async () => null),
      importRoadmap: vi.fn(async () => ({ status: 'ok', result: { roadmap_id: 1, created_modules: 1, updated_modules: 0 } })),
      exportRoadmap: vi.fn(async () => fx.roadmapDocument)
    },
    progress: {
      listRoadmapProgress: vi.fn(async () => [{
        roadmap_id: 1,
        title: 'AWS',
        description: 'Cloud',
        duration: '8 semanas',
        started_at: '2026-02-01T10:00:00.000Z',
        last_activity_at: '2026-02-02T10:00:00.000Z',
        completed_at: null,
        completed_lessons_count: 1,
        total_lessons: 4,
        total_modules: 1,
        time_spent_seconds: 120,
        current_module_id: 3,
        current_module_title: 'Redes',
        current_lesson_id: 7,
        current_lesson_title: 'Subnets',
        progress_percentage: 25,
        status: 'in_progress',
        next_href: '/modules/3',
        next_step_label: 'Continuar',
        quiz_attempts_count: 0,
        average_quiz_percentage: null,
        best_quiz_percentage: null,
        last_quiz_percentage: null
      }]),
      setLessonProgress: vi.fn(async () => fx.lessonProgressResult),
      getRoadmapDetail: vi.fn(async () => fx.roadmapDetail),
      getModuleDetail: vi.fn(async () => fx.moduleDetail),
      getModuleQuiz: vi.fn(async (userId: number | null) => ({
        quiz: fx.publicQuiz,
        summary: userId === null ? null : fx.quizSummary,
        eligibility: userId === null ? null : fx.eligibility
      })),
      submitQuizAttempt: vi.fn(async () => ({
        status: 'ok',
        attempt: fx.gradedAttempt,
        summary: fx.quizSummary,
        eligibility: fx.eligibility
      })),
      listEvidences: vi.fn(async () => [fx.evidenceListItem]),
      getModuleEvidence: vi.fn(async () => ({ evidence: fx.evidence })),
      saveModuleEvidence: vi.fn(async () => ({ evidence: fx.evidence })),
      deleteModuleEvidence: vi.fn(async () => true),
      reviewEvidence: vi.fn(async () => ({
        previous: fx.evidence,
        updated: { ...fx.evidence, review_status: 'aprobado', admin_comment: 'Bien', reviewed_at: '2026-02-03T10:00:00.000Z', reviewed_by_user_id: 1 }
      })),
      getPortfolio: vi.fn(async () => fx.portfolio),
      exportPortfolioMarkdown: vi.fn(() => '# Portfolio de Evidencias - Ana\n')
    },
    admin: {
      getDashboard: vi.fn(async () => fx.dashboard),
      listUsers: vi.fn(async () => [fx.adminUserWithAccess]),
      createUser: vi.fn(async () => ({ status: 'created', id: 2, user: fx.adminUser, role: 'user' })),
      updateUser: vi.fn(async () => ({
        status: 'ok',
        user: fx.adminUser,
        audit: { action: 'user.deactivate', details: { email: 'ana@example.com' } }
      }))
    }
  }
}

function parseWire(body: unknown) {
  return JSON.parse(JSON.stringify(body))
}

/** Asserts the status is documented and the written body parses against its schema without losing fields. */
function expectContract(operationId: string, res: any, status: number) {
  const op = operations.find(candidate => candidate.operationId === operationId)
  if (!op) throw new Error(`Unknown operation ${operationId}`)

  expect(res.statusCode, `${operationId} status`).toBe(status)
  const spec = op.responses[status]
  expect(spec, `${operationId} documents ${status}`).toBeDefined()

  if (!spec.schema) {
    expect(res.body, `${operationId} ${status} has no body`).toBeUndefined()
    return
  }

  const wire = spec.contentType && !spec.contentType.includes('json') ? res.body : parseWire(res.body)
  const parsed = spec.schema.safeParse(wire)
  expect(parsed.success, `${operationId} ${status}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true)
  // Object schemas strip unknown keys: equality proves the body has no undocumented field.
  expect(parsed.data, `${operationId} ${status} has undocumented fields`).toEqual(wire)
}

type Call = {
  operationId: string
  status: number
  /** Overrides applied after `arrangeSession`/`arrangeServices`. */
  arrange?: () => void
  role?: Role
  session?: { readRequired?: boolean; restrictedScope?: boolean }
  req?: Record<string, unknown>
}

const covered = new Set<string>()

async function run(call: Call) {
  const op = operations.find(candidate => candidate.operationId === call.operationId)
  if (!op) throw new Error(`Unknown operation ${call.operationId}`)

  arrangeServices()
  const session = arrangeSession(call.role === undefined ? 'admin' : call.role, call.session)
  call.arrange?.()

  const handler = (await handlers[op.path]()).default
  const res = createResponse()
  const query = { id: '1', ...((call.req?.query as object | undefined) ?? {}) }
  const request = createRequest({
    method: op.method.toUpperCase(),
    ...call.req,
    query: op.path.includes('{id}') ? query : (call.req?.query ?? {}),
    headers: { ...session.headers, ...((call.req?.headers as object | undefined) ?? {}) }
  })
  await handler(request, res)
  expectContract(call.operationId, res, call.status)
  covered.add(`${call.operationId} ${call.status}`)
  return res
}

const goodPassword = 'Correct-Horse-Battery-9'
const importDoc = fx.roadmapDocument

const calls: Array<[string, Call]> = [
  // Authentication
  ['setup status', { operationId: 'getSetupStatus', status: 200, role: null }],
  ['setup creates the first admin', { operationId: 'createFirstAdmin', status: 201, role: null, req: { body: { email: 'root@example.com', name: 'Root', password: goodPassword } } }],
  ['setup rejects an invalid body', { operationId: 'createFirstAdmin', status: 400, role: null, req: { body: {} } }],
  ['setup already configured', { operationId: 'createFirstAdmin', status: 409, role: null, arrange: () => { state.auth.createFirstAdmin = vi.fn(async () => ({ status: 'already_configured' })) }, req: { body: { email: 'root@example.com', password: goodPassword } } }],
  ['setup failure', { operationId: 'createFirstAdmin', status: 500, role: null, arrange: () => { state.auth.createFirstAdmin = vi.fn(async () => ({ status: 'failed' })) }, req: { body: { email: 'root@example.com', password: goodPassword } } }],
  ['setup without the token', { operationId: 'createFirstAdmin', status: 403, role: null, arrange: () => { vi.stubEnv('AUTH_SETUP_TOKEN', 's3cret') }, req: { body: { email: 'root@example.com', password: goodPassword } } }],
  ['setup rate limited', { operationId: 'createFirstAdmin', status: 429, role: null, arrange: () => { vi.stubEnv('NODE_ENV', 'production'); state.auth.registerAttempt = vi.fn(async () => ({ allowed: false })) }, req: { body: {} } }],
  ['login', { operationId: 'login', status: 200, role: null, req: { body: { email: 'ana@example.com', password: 'whatever' } } }],
  ['login invalid body', { operationId: 'login', status: 400, role: null, req: { body: {} } }],
  ['login wrong credentials', { operationId: 'login', status: 401, role: null, arrange: () => { state.auth.login = vi.fn(async () => ({ ok: false })) }, req: { body: { email: 'ana@example.com', password: 'bad' } } }],
  ['login from another origin', { operationId: 'login', status: 403, role: null, req: { body: { email: 'a@b.c', password: 'x' }, headers: { origin: 'https://evil.example', host: 'app.example' } } }],
  ['login rate limited', { operationId: 'login', status: 429, role: null, arrange: () => { vi.stubEnv('NODE_ENV', 'production'); state.auth.registerAttempt = vi.fn(async () => ({ allowed: false })) }, req: { body: {} } }],
  ['logout', { operationId: 'logout', status: 200, role: 'user' }],
  ['me with a session', { operationId: 'getCurrentUser', status: 200, role: 'user' }],
  ['me without a session', { operationId: 'getCurrentUser', status: 200, role: null }],

  // Catalog
  ['list roadmaps', { operationId: 'listRoadmaps', status: 200, role: null }],
  ['list roadmaps with an invalid filter', { operationId: 'listRoadmaps', status: 400, role: null, req: { query: { q: { nested: 'x' } } } }],
  ['list roadmaps needs a session when reads are protected', { operationId: 'listRoadmaps', status: 401, role: null, session: { readRequired: true } }],
  ['create roadmap', { operationId: 'createRoadmap', status: 201, req: { method: 'POST', body: { title: 'AWS', description: 'Cloud' } } }],
  ['create roadmap invalid body', { operationId: 'createRoadmap', status: 400, req: { body: {} } }],
  ['create roadmap without session', { operationId: 'createRoadmap', status: 401, role: null, req: { body: { title: 'AWS' } } }],
  ['create roadmap as learner', { operationId: 'createRoadmap', status: 403, role: 'user', req: { body: { title: 'AWS' } } }],
  ['create roadmap fails', { operationId: 'createRoadmap', status: 500, arrange: () => { state.services.content.createRoadmap = vi.fn(async () => null) }, req: { body: { title: 'AWS' } } }],
  ['catalog metadata', { operationId: 'getCatalogMetadata', status: 200, role: null }],
  ['import preview', { operationId: 'importRoadmap', status: 200, req: { body: { action: 'preview', roadmap: importDoc } } }],
  ['import preview of an existing roadmap', { operationId: 'importRoadmap', status: 200, arrange: () => { state.services.content.findImportTarget = vi.fn(async () => ({ id: 1, title: 'AWS' })) }, req: { body: { action: 'preview', roadmap: importDoc } } }],
  ['import update', { operationId: 'importRoadmap', status: 200, req: { body: { action: 'publish', strategy: 'update', roadmap: importDoc } } }],
  ['import create', { operationId: 'importRoadmap', status: 201, req: { body: { action: 'publish', strategy: 'create', roadmap: importDoc } } }],
  ['import with document errors', { operationId: 'importRoadmap', status: 400, req: { body: { action: 'preview', roadmap: { title: '' } } } }],
  ['import conflict', { operationId: 'importRoadmap', status: 409, arrange: () => { state.services.content.importRoadmap = vi.fn(async () => ({ status: 'conflict', code: 'already_exists' })) }, req: { body: { action: 'publish', strategy: 'create', roadmap: importDoc } } }],
  ['import too large', { operationId: 'importRoadmap', status: 413, req: { body: { action: 'preview', roadmap: { title: 'x'.repeat(1024 * 1024 + 1) } } } }],
  ['roadmap detail', { operationId: 'getRoadmap', status: 200, role: 'user' }],
  ['roadmap detail invalid id', { operationId: 'getRoadmap', status: 400, role: null, req: { query: { id: 'abc' } } }],
  ['roadmap detail missing', { operationId: 'getRoadmap', status: 404, role: null, arrange: () => { state.services.progress.getRoadmapDetail = vi.fn(async () => null) } }],
  ['update roadmap', { operationId: 'updateRoadmap', status: 200, req: { body: { title: 'AWS' } } }],
  ['update roadmap missing', { operationId: 'updateRoadmap', status: 404, arrange: () => { state.services.content.updateRoadmap = vi.fn(async () => null) }, req: { body: { title: 'AWS' } } }],
  ['delete roadmap', { operationId: 'deleteRoadmap', status: 204 }],
  ['export roadmap', { operationId: 'exportRoadmap', status: 200, role: null }],
  ['export roadmap hidden from the reader', { operationId: 'exportRoadmap', status: 403, role: 'user', session: { restrictedScope: true } }],
  ['export roadmap missing', { operationId: 'exportRoadmap', status: 404, role: null, arrange: () => { state.services.content.exportRoadmap = vi.fn(async () => null) } }],
  ['list modules', { operationId: 'listModules', status: 200, role: null, req: { query: { roadmap_id: '1' } } }],
  ['create module', { operationId: 'createModule', status: 201, req: { body: { title: 'Redes', roadmap_id: 1 } } }],
  ['module detail', { operationId: 'getModule', status: 200, role: 'user' }],
  ['module detail missing', { operationId: 'getModule', status: 404, role: null, arrange: () => { state.services.progress.getModuleDetail = vi.fn(async () => null) } }],
  ['update module', { operationId: 'updateModule', status: 200, req: { body: { title: 'Redes' } } }],
  ['update module missing', { operationId: 'updateModule', status: 404, arrange: () => { state.services.content.updateModule = vi.fn(async () => null) }, req: { body: { title: 'Redes' } } }],
  ['delete module', { operationId: 'deleteModule', status: 204 }],
  ['delete module missing', { operationId: 'deleteModule', status: 404, arrange: () => { state.services.content.deleteModule = vi.fn(async () => null) } }],
  ['list lessons', { operationId: 'listLessons', status: 200, role: null, req: { query: { module_id: '3' } } }],
  ['list lessons without module_id', { operationId: 'listLessons', status: 400, role: null }],
  ['create lesson', { operationId: 'createLesson', status: 201, req: { body: { title: 'Subnets', module_id: 3 } } }],
  ['lesson detail', { operationId: 'getLesson', status: 200, role: null }],
  ['lesson detail missing', { operationId: 'getLesson', status: 404, role: null, arrange: () => { state.services.content.getLesson = vi.fn(async () => null) } }],
  ['update lesson', { operationId: 'updateLesson', status: 200, req: { body: { title: 'Subnets', completed: true } } }],
  ['update lesson missing', { operationId: 'updateLesson', status: 404, arrange: () => { state.services.content.updateLesson = vi.fn(async () => null) }, req: { body: { title: 'Subnets' } } }],
  ['delete lesson', { operationId: 'deleteLesson', status: 204 }],
  ['delete lesson missing', { operationId: 'deleteLesson', status: 404, arrange: () => { state.services.content.deleteLesson = vi.fn(async () => null) } }],

  // Progress and quizzes
  ['roadmap progress', { operationId: 'listRoadmapProgress', status: 200, role: 'user' }],
  ['roadmap progress without session', { operationId: 'listRoadmapProgress', status: 401, role: null }],
  ['lesson progress', { operationId: 'setLessonProgress', status: 200, role: 'user', req: { body: { completed: true, time_spent_seconds: 60 } } }],
  ['lesson progress invalid body', { operationId: 'setLessonProgress', status: 400, role: 'user', req: { body: {} } }],
  ['lesson progress missing', { operationId: 'setLessonProgress', status: 404, role: 'user', arrange: () => { state.services.progress.setLessonProgress = vi.fn(async () => null) }, req: { body: { completed: true } } }],
  ['quiz for an anonymous reader', { operationId: 'getModuleQuiz', status: 200, role: null }],
  ['quiz for a learner', { operationId: 'getModuleQuiz', status: 200, role: 'user' }],
  ['quiz missing', { operationId: 'getModuleQuiz', status: 404, role: 'user', arrange: () => { state.services.progress.getModuleQuiz = vi.fn(async () => null) } }],
  ['quiz needs a session when reads are protected', { operationId: 'getModuleQuiz', status: 401, role: null, session: { readRequired: true }, arrange: () => { vi.stubEnv('REQUIRE_AUTH_FOR_READS', 'true') } }],
  ['quiz attempt', { operationId: 'submitQuizAttempt', status: 201, role: 'user', req: { body: { answers: fx.quizAnswers() } } }],
  ['quiz attempt invalid body', { operationId: 'submitQuizAttempt', status: 400, role: 'user', req: { body: {} } }],
  ['quiz attempt with incomplete answers', { operationId: 'submitQuizAttempt', status: 400, role: 'user', arrange: () => { state.services.progress.submitQuizAttempt = vi.fn(async () => ({ status: 'invalid_answers' })) }, req: { body: { answers: {} } } }],
  ['quiz attempt missing module', { operationId: 'submitQuizAttempt', status: 404, role: 'user', arrange: () => { state.services.progress.submitQuizAttempt = vi.fn(async () => ({ status: 'not_found' })) }, req: { body: { answers: {} } } }],
  ['quiz attempt without questions', { operationId: 'submitQuizAttempt', status: 422, role: 'user', arrange: () => { state.services.progress.submitQuizAttempt = vi.fn(async () => ({ status: 'no_questions' })) }, req: { body: { answers: {} } } }],
  ['quiz attempt in cooldown', { operationId: 'submitQuizAttempt', status: 429, role: 'user', arrange: () => { state.services.progress.submitQuizAttempt = vi.fn(async () => ({ status: 'not_eligible', eligibility: { allowed: false, remaining_attempts: 2, cooldown_ends_at: '2026-02-02T11:00:00.000Z', pass_percentage: 70 } })) }, req: { body: { answers: {} } } }],

  // Evidences and portfolio
  ['module evidence', { operationId: 'getModuleEvidence', status: 200, role: 'user' }],
  ['module evidence without evidence', { operationId: 'getModuleEvidence', status: 200, role: 'user', arrange: () => { state.services.progress.getModuleEvidence = vi.fn(async () => ({ evidence: null })) } }],
  ['module evidence for an anonymous reader', { operationId: 'getModuleEvidence', status: 401, role: null }],
  ['module evidence missing module', { operationId: 'getModuleEvidence', status: 404, role: 'user', arrange: () => { state.services.progress.getModuleEvidence = vi.fn(async () => null) } }],
  ['save evidence', { operationId: 'saveModuleEvidence', status: 200, role: 'user', req: { body: { evidence_type: 'github', url: 'https://github.com/ana/proyecto' } } }],
  ['save evidence invalid body', { operationId: 'saveModuleEvidence', status: 400, role: 'user', req: { body: { evidence_type: 'video' } } }],
  ['save evidence missing module', { operationId: 'saveModuleEvidence', status: 404, role: 'user', arrange: () => { state.services.progress.saveModuleEvidence = vi.fn(async () => null) }, req: { body: { evidence_type: 'note', note: 'Hecho' } } }],
  ['delete evidence', { operationId: 'deleteModuleEvidence', status: 204, role: 'user' }],
  ['delete evidence not found', { operationId: 'deleteModuleEvidence', status: 404, role: 'user', arrange: () => { state.services.progress.deleteModuleEvidence = vi.fn(async () => false) } }],
  ['list evidences', { operationId: 'listEvidences', status: 200, req: { query: { status: 'pendiente' } } }],
  ['review evidence', { operationId: 'reviewEvidence', status: 200, req: { body: { review_status: 'aprobado', admin_comment: 'Bien' } } }],
  ['review evidence invalid body', { operationId: 'reviewEvidence', status: 400, req: { body: { review_status: 'otro' } } }],
  ['review evidence missing', { operationId: 'reviewEvidence', status: 404, arrange: () => { state.services.progress.reviewEvidence = vi.fn(async () => null) }, req: { body: { review_status: 'aprobado' } } }],
  ['review evidence fails', { operationId: 'reviewEvidence', status: 500, arrange: () => { vi.spyOn(console, 'error').mockImplementation(() => undefined); state.services.progress.reviewEvidence = vi.fn(async () => { throw new Error('boom') }) }, req: { body: { review_status: 'aprobado' } } }],
  ['portfolio', { operationId: 'getPortfolio', status: 200, role: 'user' }],
  ['portfolio of a missing user', { operationId: 'getPortfolio', status: 404, role: 'user', arrange: () => { state.services.progress.getPortfolio = vi.fn(async () => null) } }],
  ['portfolio export', { operationId: 'exportPortfolio', status: 200, role: 'user' }],
  ['portfolio export of a missing user', { operationId: 'exportPortfolio', status: 404, role: 'user', arrange: () => { state.services.progress.getPortfolio = vi.fn(async () => null) } }],

  // Administration
  ['dashboard', { operationId: 'getAdminDashboard', status: 200 }],
  ['dashboard as learner', { operationId: 'getAdminDashboard', status: 403, role: 'user' }],
  ['audit logs', { operationId: 'listAuditLogs', status: 200 }],
  ['list users', { operationId: 'listUsers', status: 200 }],
  ['create user', { operationId: 'createUser', status: 201, req: { body: { email: 'ana@example.com', name: 'Ana', password: goodPassword } } }],
  ['create user invalid body', { operationId: 'createUser', status: 400, req: { body: {} } }],
  ['create user duplicate email', { operationId: 'createUser', status: 409, arrange: () => { state.services.admin.createUser = vi.fn(async () => ({ status: 'duplicate_email' })) }, req: { body: { email: 'ana@example.com', password: goodPassword } } }],
  ['create user fails', { operationId: 'createUser', status: 500, arrange: () => { state.services.admin.createUser = vi.fn(async () => ({ status: 'failed' })) }, req: { body: { email: 'ana@example.com', password: goodPassword } } }],
  ['update user active flag', { operationId: 'updateUser', status: 200, req: { body: { action: 'set_active', is_active: false } } }],
  ['update user roadmap access', { operationId: 'updateUser', status: 200, arrange: () => { state.services.admin.updateUser = vi.fn(async () => ({ status: 'ok', user: fx.adminUserWithAccess, audit: { action: 'user.update_roadmap_access', details: {} } })) }, req: { body: { action: 'set_roadmap_access', can_view_all_roadmaps: false, roadmap_ids: [1] } } }],
  ['update user invalid body', { operationId: 'updateUser', status: 400, req: { body: { action: 'delete' } } }],
  ['update user business rule', { operationId: 'updateUser', status: 400, arrange: () => { state.services.admin.updateUser = vi.fn(async () => ({ status: 'rejected', violation: 'cannot_deactivate_self' })) }, req: { body: { action: 'set_active', is_active: false } } }],
  ['update user with unknown roadmaps', { operationId: 'updateUser', status: 400, arrange: () => { state.services.admin.updateUser = vi.fn(async () => ({ status: 'rejected', violation: 'unknown_roadmaps' })) }, req: { body: { action: 'set_roadmap_access', can_view_all_roadmaps: false, roadmap_ids: [99] } } }],
  ['update user missing', { operationId: 'updateUser', status: 404, arrange: () => { state.services.admin.updateUser = vi.fn(async () => ({ status: 'not_found' })) }, req: { body: { action: 'set_active', is_active: true } } }],

  // Contract
  ['openapi document', { operationId: 'getOpenApiDocument', status: 200, role: null }]
]

describe('API handler responses match the contract registry', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(calls)('%s', async (_name, call) => {
    await run(call)
  })

  it('documents the exact message of the error responses it checks', async () => {
    const res = await run({ operationId: 'login', status: 401, role: null, arrange: () => { state.auth.login = vi.fn(async () => ({ ok: false })) }, req: { body: { email: 'a@b.c', password: 'x' } } })
    expect(res.body).toEqual({ error: 'invalid credentials' })

    const forbidden = await run({ operationId: 'getAdminDashboard', status: 403, role: 'user' })
    expect(forbidden.body).toEqual({ error: 'admin role required' })
  })

  it('serves the portfolio as an attachment with a Markdown content type', async () => {
    const res = await run({ operationId: 'exportPortfolio', status: 200, role: 'user' })
    expect(res.headers['Content-Type']).toBe('text/markdown; charset=utf-8')
    expect(res.headers['Content-Disposition']).toMatch(/^attachment; filename="portfolio-.+\.md"$/)
  })

  it('answers 405 with plain text and the registry methods in Allow, on every path', async () => {
    for (const [path, methods] of methodsByPath()) {
      arrangeServices()
      arrangeSession('admin')
      const handler = (await handlers[path]()).default
      const res = createResponse()
      await handler(createRequest({ method: 'OPTIONS', query: { id: '1' }, headers: COOKIE }), res)

      expect(res.statusCode, path).toBe(405)
      expect(res.body, path).toBe('Method Not Allowed')
      const allow = String(res.headers.Allow).split(',').map(method => method.trim().toLowerCase()).sort()
      expect(allow, path).toEqual([...methods].sort())
    }
  })

  it('covers the success status of every operation', () => {
    for (const op of operations) {
      const successes = Object.keys(op.responses).map(Number).filter(status => status >= 200 && status < 300)
      for (const status of successes) {
        expect(covered.has(`${op.operationId} ${status}`), `${op.operationId} ${status} has no contract test`).toBe(true)
      }
    }
  })
})
