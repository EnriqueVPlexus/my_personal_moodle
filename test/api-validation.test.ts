import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest, createResponse } from './helpers/api'

const admin = { id: 1, email: 'admin@example.com', role: 'admin' as const }
const user = { id: 2, email: 'user@example.com', role: 'user' as const, is_active: 1 }

function createDb() {
  return {
    backend: 'sqlite',
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
    exec: vi.fn()
  }
}

async function loadHandler(route: string) {
  vi.resetModules()
  const db = createDb()
  vi.doMock('../lib/persistence', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
  vi.doMock('../lib/http/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
  vi.doMock('../lib/http/rateLimit', () => ({
    rateLimit: vi.fn().mockResolvedValue(true),
    clearRateLimit: vi.fn().mockResolvedValue(undefined)
  }))
  vi.doMock('../lib/http/auth', async () => ({
    ...(await vi.importActual('../lib/http/auth') as object),
    requireAdmin: vi.fn().mockResolvedValue(admin),
    requireUser: vi.fn().mockResolvedValue(user),
    requireSameOrigin: vi.fn().mockReturnValue(true),
    validateSetupToken: vi.fn().mockReturnValue(true),
    getRoadmapReadScope: vi.fn().mockResolvedValue({ user, allRoadmaps: true, roadmapIds: [] }),
    scopeAllowsRoadmap: vi.fn().mockReturnValue(true)
  }))
  const handler = (await import(route)).default
  return { db, handler }
}

type Case = {
  name: string
  route: string
  method: string
  query?: Record<string, unknown>
  body?: unknown
  path: string
  message: string | RegExp
}

const ID_MESSAGE = 'El campo «id» debe ser un número entero positivo.'
const BODY_MESSAGE = 'El cuerpo de la petición debe ser un objeto JSON.'

const cases: Case[] = [
  // auth
  { name: 'login without credentials', route: '../pages/api/auth/login', method: 'POST', body: {}, path: 'email', message: 'Introduce tu correo electrónico.' },
  { name: 'login with a missing body', route: '../pages/api/auth/login', method: 'POST', body: undefined, path: '', message: BODY_MESSAGE },
  { name: 'setup with an invalid email', route: '../pages/api/auth/setup', method: 'POST', body: { email: 'nope', password: 'valid-password-123' }, path: 'email', message: 'El correo electrónico no es válido.' },
  { name: 'setup with a short password', route: '../pages/api/auth/setup', method: 'POST', body: { email: 'a@b.es', password: 'short' }, path: 'password', message: 'La contraseña debe tener al menos 12 caracteres.' },
  // users
  { name: 'user creation without email', route: '../pages/api/users/index', method: 'POST', body: { password: 'valid-password-123' }, path: 'email', message: 'Falta el campo «correo electrónico».' },
  { name: 'user update with a bad id', route: '../pages/api/users/[id]', method: 'PATCH', query: { id: 'abc' }, body: { action: 'set_active', is_active: true }, path: 'id', message: ID_MESSAGE },
  { name: 'user update with an unknown action', route: '../pages/api/users/[id]', method: 'PATCH', query: { id: '3' }, body: { action: 'rename' }, path: 'action', message: 'Acción no admitida.' },
  { name: 'user update with a non boolean flag', route: '../pages/api/users/[id]', method: 'PATCH', query: { id: '3' }, body: { action: 'set_active', is_active: 'no' }, path: 'is_active', message: 'El campo «is_active» debe ser verdadero o falso.' },
  { name: 'roadmap access with invalid ids', route: '../pages/api/users/[id]', method: 'PATCH', query: { id: '3' }, body: { action: 'set_roadmap_access', can_view_all_roadmaps: false, roadmap_ids: [1, -2] }, path: 'roadmap_ids[1]', message: 'El campo «roadmap_ids» debe ser un número entero positivo.' },
  // roadmaps
  { name: 'roadmap creation without title', route: '../pages/api/roadmaps/index', method: 'POST', body: {}, path: 'title', message: 'Falta el campo «título».' },
  { name: 'roadmap creation with a missing body', route: '../pages/api/roadmaps/index', method: 'POST', body: undefined, path: '', message: BODY_MESSAGE },
  { name: 'roadmap creation with too many topics', route: '../pages/api/roadmaps/index', method: 'POST', body: { title: 'x', topics: Array.from({ length: 21 }, (_, index) => `t${index}`) }, path: 'topics', message: 'Un roadmap puede tener como máximo 20 temas.' },
  { name: 'roadmap creation with an invalid version', route: '../pages/api/roadmaps/index', method: 'POST', body: { title: 'x', version: 'abc' }, path: 'version', message: /versión/ },
  { name: 'roadmap catalog with an oversized search', route: '../pages/api/roadmaps/index', method: 'GET', query: { q: 'a'.repeat(101) }, path: 'q', message: 'La búsqueda no puede superar 100 caracteres.' },
  { name: 'roadmap detail with a zero id', route: '../pages/api/roadmaps/[id]', method: 'GET', query: { id: '0' }, path: 'id', message: ID_MESSAGE },
  { name: 'roadmap update with a missing body', route: '../pages/api/roadmaps/[id]', method: 'PUT', query: { id: '3' }, body: undefined, path: '', message: BODY_MESSAGE },
  { name: 'roadmap deletion with a decimal id', route: '../pages/api/roadmaps/[id]', method: 'DELETE', query: { id: '1.5' }, path: 'id', message: ID_MESSAGE },
  { name: 'roadmap export with a bad id', route: '../pages/api/roadmaps/[id]/export', method: 'GET', query: { id: 'abc' }, path: 'id', message: ID_MESSAGE },
  // modules
  { name: 'module creation without roadmap_id', route: '../pages/api/modules/index', method: 'POST', body: { title: 'M' }, path: 'roadmap_id', message: 'Falta el campo «roadmap_id».' },
  { name: 'module creation with an invalid level', route: '../pages/api/modules/index', method: 'POST', body: { title: 'M', roadmap_id: 1, level: 'expert' }, path: 'level', message: 'El nivel del módulo no es válido.' },
  { name: 'module listing with a bad roadmap_id', route: '../pages/api/modules/index', method: 'GET', query: { roadmap_id: 'x' }, path: 'roadmap_id', message: 'El campo «roadmap_id» debe ser un número entero positivo.' },
  { name: 'module detail with a negative id', route: '../pages/api/modules/[id]', method: 'GET', query: { id: '-1' }, path: 'id', message: ID_MESSAGE },
  { name: 'module update with a missing body', route: '../pages/api/modules/[id]', method: 'PUT', query: { id: '2' }, body: undefined, path: '', message: BODY_MESSAGE },
  // lessons
  { name: 'lesson creation without fields', route: '../pages/api/lessons/index', method: 'POST', body: {}, path: 'title', message: 'Falta el campo «título».' },
  { name: 'lesson creation with a missing body', route: '../pages/api/lessons/index', method: 'POST', body: undefined, path: '', message: BODY_MESSAGE },
  { name: 'lesson listing without module_id', route: '../pages/api/lessons/index', method: 'GET', query: {}, path: 'module_id', message: 'Falta el campo «module_id».' },
  { name: 'lesson detail with a bad id', route: '../pages/api/lessons/[id]', method: 'GET', query: { id: 'abc' }, path: 'id', message: ID_MESSAGE },
  { name: 'lesson update with a non text title', route: '../pages/api/lessons/[id]', method: 'PUT', query: { id: '4' }, body: { title: 42 }, path: 'title', message: 'El campo «título» debe ser un texto.' },
  { name: 'lesson update with a non boolean completed', route: '../pages/api/lessons/[id]', method: 'PUT', query: { id: '4' }, body: { title: 'x', completed: 'si' }, path: 'completed', message: 'El campo «completed» debe ser verdadero o falso.' },
  { name: 'lesson update with a missing body', route: '../pages/api/lessons/[id]', method: 'PUT', query: { id: '4' }, body: undefined, path: '', message: BODY_MESSAGE },
  { name: 'lesson deletion with a bad id', route: '../pages/api/lessons/[id]', method: 'DELETE', query: { id: '0' }, path: 'id', message: ID_MESSAGE },
  // progress and quizzes
  { name: 'lesson progress with a bad id', route: '../pages/api/progress/lessons/[id]', method: 'PUT', query: { id: 'abc' }, body: { completed: true }, path: 'id', message: ID_MESSAGE },
  { name: 'lesson progress with a bad completed flag', route: '../pages/api/progress/lessons/[id]', method: 'PUT', query: { id: '4' }, body: { completed: 'maybe' }, path: 'completed', message: 'El campo «completed» debe ser verdadero o falso.' },
  { name: 'lesson progress with negative time', route: '../pages/api/progress/lessons/[id]', method: 'PUT', query: { id: '4' }, body: { completed: true, time_spent_seconds: -5 }, path: 'time_spent_seconds', message: 'El campo «time_spent_seconds» debe ser un número no negativo.' },
  { name: 'quiz read with a bad id', route: '../pages/api/quizzes/modules/[id]', method: 'GET', query: { id: '1.5' }, path: 'id', message: ID_MESSAGE },
  { name: 'quiz attempt without answers', route: '../pages/api/quizzes/modules/[id]', method: 'POST', query: { id: '1' }, body: {}, path: 'answers', message: 'El campo «answers» debe ser un objeto con las respuestas.' },
  { name: 'quiz attempt with array answers', route: '../pages/api/quizzes/modules/[id]', method: 'POST', query: { id: '1' }, body: { answers: [0, 1] }, path: 'answers', message: 'El campo «answers» debe ser un objeto con las respuestas.' },
  // evidences
  { name: 'evidence list with a bad filter', route: '../pages/api/evidences/index', method: 'GET', query: { module_id: ['0'] }, path: 'module_id', message: 'El campo «module_id» debe ser un número entero positivo.' },
  { name: 'evidence read with a bad id', route: '../pages/api/evidences/modules/[id]', method: 'GET', query: { id: 'abc' }, path: 'id', message: ID_MESSAGE },
  { name: 'evidence save with an invalid type', route: '../pages/api/evidences/modules/[id]', method: 'PUT', query: { id: '7' }, body: { evidence_type: 'video', note: 'x' }, path: 'evidence_type', message: 'El tipo de evidencia no es válido.' },
  { name: 'evidence save with a missing body', route: '../pages/api/evidences/modules/[id]', method: 'PUT', query: { id: '7' }, body: undefined, path: '', message: BODY_MESSAGE },
  { name: 'evidence review with a bad id', route: '../pages/api/evidences/[id]/review', method: 'PUT', query: { id: '-3' }, body: { review_status: 'aprobado' }, path: 'id', message: ID_MESSAGE },
  { name: 'evidence review with a bad status', route: '../pages/api/evidences/[id]/review', method: 'PUT', query: { id: '3' }, body: { review_status: 'hecho' }, path: 'review_status', message: 'El estado de revisión no es válido.' },
  // import
  { name: 'import with an unknown action', route: '../pages/api/roadmaps/import', method: 'POST', body: { action: 'wrong', roadmap: {} }, path: 'action', message: 'Acción de importación no válida.' },
  { name: 'import publishing without strategy', route: '../pages/api/roadmaps/import', method: 'POST', body: { action: 'publish', roadmap: {} }, path: 'strategy', message: 'La estrategia debe ser create o update.' }
]

describe('API input validation contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it.each(cases)('$name returns 400 with { error, issues } before any business query', async testCase => {
    const { db, handler } = await loadHandler(testCase.route)
    const res = createResponse()

    await handler(
      createRequest({ method: testCase.method, query: testCase.query ?? {}, body: testCase.body }),
      res
    )

    expect(res.statusCode).toBe(400)
    expect(typeof res.body.error).toBe('string')
    const issue = res.body.issues.find((item: { path: string }) => item.path === testCase.path)
    expect(issue).toBeDefined()
    if (typeof testCase.message === 'string') expect(issue.message).toBe(testCase.message)
    else expect(issue.message).toMatch(testCase.message)
    // `error` is the first issue message so UIs that only render `data.error` stay actionable.
    expect(res.body.error).toBe(res.body.issues[0].message)
    expect(Object.keys(res.body).sort()).toEqual(['error', 'issues'])
    expect(db.get).not.toHaveBeenCalled()
    expect(db.all).not.toHaveBeenCalled()
    expect(db.run).not.toHaveBeenCalled()
    expect(db.exec).not.toHaveBeenCalled()
  })

  it('treats an empty roadmap_id as no filter when listing modules', async () => {
    const { db, handler } = await loadHandler('../pages/api/modules/index')
    db.all.mockResolvedValueOnce([{ id: 1 }])
    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { roadmap_id: '' } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual([{ id: 1 }])
  })

  it('keeps requiring module_id (400) when it is empty on lesson listing', async () => {
    const { db, handler } = await loadHandler('../pages/api/lessons/index')
    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { module_id: '' } }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.issues[0].path).toBe('module_id')
    expect(db.all).not.toHaveBeenCalled()
  })

  it('keeps 405 for unsupported methods before validating anything', async () => {
    const { handler } = await loadHandler('../pages/api/lessons/[id]')
    const res = createResponse()
    await handler(createRequest({ method: 'PATCH', query: { id: 'abc' } }), res)
    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('GET, PUT, DELETE')
  })

  it('does not run auth-protected validation before the 401/403 guards', async () => {
    vi.resetModules()
    const db = createDb()
    vi.doMock('../lib/persistence', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
    vi.doMock('../lib/http/audit', () => ({ writeAuditLog: vi.fn() }))
    vi.doMock('../lib/http/auth', async () => ({
      ...(await vi.importActual('../lib/http/auth') as object),
      requireAdmin: vi.fn((_req: unknown, res: any) => {
        res.status(403).json({ error: 'admin role required' })
        return null
      })
    }))
    const handler = (await import('../pages/api/lessons/index')).default
    const res = createResponse()
    await handler(createRequest({ method: 'POST', body: undefined }), res)
    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'admin role required' })
  })

  it('passes parsed numeric ids to the repositories', async () => {
    const { db, handler } = await loadHandler('../pages/api/lessons/index')
    db.get
      .mockResolvedValueOnce({ id: 3, roadmap_id: 9 })
    db.all.mockResolvedValueOnce([{ id: 1 }])
    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { module_id: ['3', '4'] } }), res)

    expect(res.statusCode).toBe(200)
    expect(db.get).toHaveBeenCalledWith(expect.any(String), [3])
    expect(db.all).toHaveBeenCalledWith(expect.any(String), [3])
  })

  it('trims titles and accepts numeric string ids when creating lessons', async () => {
    const { db, handler } = await loadHandler('../pages/api/lessons/index')
    db.run.mockResolvedValueOnce({ lastID: 11 })
    db.get.mockResolvedValueOnce({ id: 11, module_id: 5, title: 'Intro' })
    const res = createResponse()
    await handler(createRequest({ method: 'POST', body: { title: '  Intro  ', module_id: '5' } }), res)

    expect(res.statusCode).toBe(201)
    expect(db.run).toHaveBeenCalledWith(expect.any(String), [5, 'Intro', 0])
  })
})
