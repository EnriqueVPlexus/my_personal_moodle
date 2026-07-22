import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest, createResponse } from './helpers/api'

const admin = { id: 1, email: 'admin@example.com', role: 'admin' as const }
const normalUser = { id: 2, email: 'user@example.com', role: 'user' as const, is_active: 1 }

function denyAdmin(res: any) {
  res.status(403).json({ error: 'admin role required' })
  return null
}

async function mockContentApi(
  db: any,
  options: { admin?: typeof admin | null; read?: boolean; user?: typeof normalUser | null } = {}
) {
  vi.resetModules()
  vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
  vi.doMock('../lib/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
  vi.doMock('../lib/auth', () => ({
    requireAdmin: vi.fn((_req: any, res: any) => {
      const actor = options.admin === undefined ? admin : options.admin
      return actor || denyAdmin(res)
    }),
    requireReadAccess: vi.fn((_req: any, res: any) => {
      if (options.read === false) {
        res.status(401).json({ error: 'authentication required' })
        return false
      }
      return true
    }),
    getUserFromRequest: vi.fn().mockResolvedValue(options.user === undefined ? null : options.user),
    getRoadmapReadScope: vi.fn((_req: any, res: any) => {
      if (options.read === false) {
        res.status(401).json({ error: 'authentication required' })
        return null
      }
      return {
        user: options.user === undefined ? null : options.user,
        allRoadmaps: true,
        roadmapIds: []
      }
    }),
    scopeAllowsRoadmap: vi.fn().mockReturnValue(true),
    requireUser: vi.fn((_req: any, res: any) => {
      const actor = options.user === undefined ? null : options.user
      if (!actor) {
        res.status(401).json({ error: 'authentication required' })
        return null
      }
      return actor
    })
  }))
}

async function mockUsersApi(
  db: any,
  options: { admin?: typeof admin | null; validatePassword?: (password: string) => string | null } = {}
) {
  vi.resetModules()
  vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
  vi.doMock('../lib/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
  vi.doMock('../lib/auth', () => ({
    isValidRole: (role: unknown) => role === 'admin' || role === 'user',
    requireAdmin: vi.fn((_req: any, res: any) => {
      const actor = options.admin === undefined ? admin : options.admin
      return actor || denyAdmin(res)
    })
  }))
  vi.doMock('../lib/password', () => ({
    normalizeEmail: (email: string) => email.trim().toLowerCase(),
    validatePassword: vi.fn(options.validatePassword || (() => null)),
    hashPassword: vi.fn().mockResolvedValue('hash')
  }))
}

async function mockAuthApi(
  db: any,
  options: {
    sameOrigin?: boolean;
    verifiedPassword?: boolean;
    setupToken?: boolean;
    passwordError?: string | null;
    currentUser?: typeof admin | null;
  } = {}
) {
  vi.resetModules()
  vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
  vi.doMock('../lib/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
  vi.doMock('../lib/auth', () => ({
    createSession: vi.fn((_res: any) => _res.setHeader('Set-Cookie', 'moodle_session=token')),
    clearSession: vi.fn((_req: any, res: any) => res.setHeader('Set-Cookie', 'moodle_session=; Max-Age=0')),
    getUserFromRequest: vi.fn().mockResolvedValue(options.currentUser === undefined ? admin : options.currentUser),
    requireSameOrigin: vi.fn((_req: any, res: any) => {
      if (options.sameOrigin === false) {
        res.status(403).json({ error: 'origin not allowed' })
        return false
      }
      return true
    }),
    validateSetupToken: vi.fn().mockReturnValue(options.setupToken !== false)
  }))
  vi.doMock('../lib/password', () => ({
    normalizeEmail: (email: string) => email.trim().toLowerCase(),
    validatePassword: vi.fn().mockReturnValue(options.passwordError || null),
    hashPassword: vi.fn().mockResolvedValue('hash'),
    verifyPassword: vi.fn().mockResolvedValue(options.verifiedPassword !== false)
  }))
}

describe('content API edge cases', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('blocks private reads and denied admin writes', async () => {
    const db = { all: vi.fn(), get: vi.fn(), run: vi.fn() }
    await mockContentApi(db, { admin: null, read: false })
    const roadmaps = (await import('../pages/api/roadmaps/index')).default
    const roadmapDetail = (await import('../pages/api/roadmaps/[id]')).default
    const modules = (await import('../pages/api/modules/index')).default
    const moduleDetail = (await import('../pages/api/modules/[id]')).default
    const lessons = (await import('../pages/api/lessons/index')).default
    const lessonDetail = (await import('../pages/api/lessons/[id]')).default
    const lessonProgress = (await import('../pages/api/progress/lessons/[id]')).default
    const roadmapProgress = (await import('../pages/api/progress/roadmaps')).default
    const moduleQuiz = (await import('../pages/api/quizzes/modules/[id]')).default

    for (const handler of [roadmaps, modules, lessons, roadmapDetail, moduleDetail, lessonDetail, moduleQuiz]) {
      const res = createResponse()
      await handler(createRequest({ method: 'GET', query: { id: '1', roadmap_id: '1', module_id: '1' } }), res)
      expect(res.statusCode).toBe(401)
    }

    for (const handler of [roadmaps, modules, lessons]) {
      const res = createResponse()
      await handler(createRequest({ method: 'POST', body: { title: 'Blocked', roadmap_id: 1, module_id: 1 } }), res)
      expect(res.statusCode).toBe(403)
    }

    for (const handler of [roadmapDetail, moduleDetail, lessonDetail]) {
      const putRes = createResponse()
      await handler(createRequest({ method: 'PUT', query: { id: '1' }, body: { title: 'Blocked' } }), putRes)
      expect(putRes.statusCode).toBe(403)

      const deleteRes = createResponse()
      await handler(createRequest({ method: 'DELETE', query: { id: '1' } }), deleteRes)
      expect(deleteRes.statusCode).toBe(403)
    }

    const progressRes = createResponse()
    await lessonProgress(createRequest({ method: 'PUT', query: { id: '1' }, body: { completed: true } }), progressRes)
    expect(progressRes.statusCode).toBe(401)

    const roadmapProgressRes = createResponse()
    await roadmapProgress(createRequest({ method: 'GET' }), roadmapProgressRes)
    expect(roadmapProgressRes.statusCode).toBe(401)

    const quizSubmitRes = createResponse()
    await moduleQuiz(createRequest({ method: 'POST', query: { id: '1' }, body: { answers: {} } }), quizSubmitRes)
    expect(quizSubmitRes.statusCode).toBe(401)
  })

  it('validates collection payloads and unsupported methods', async () => {
    const db = {
      all: vi.fn().mockResolvedValue([]),
      run: vi.fn().mockResolvedValue({ lastID: 10 }),
      get: vi.fn().mockResolvedValue({ id: 10, title: 'New' })
    }
    await mockContentApi(db)
    const roadmaps = (await import('../pages/api/roadmaps/index')).default
    const modules = (await import('../pages/api/modules/index')).default
    const lessons = (await import('../pages/api/lessons/index')).default

    const roadmapMissing = createResponse()
    await roadmaps(createRequest({ method: 'POST', body: {} }), roadmapMissing)
    expect(roadmapMissing.statusCode).toBe(400)

    const roadmapNoDescription = createResponse()
    await roadmaps(createRequest({ method: 'POST', body: { title: 'No desc' } }), roadmapNoDescription)
    expect(roadmapNoDescription.statusCode).toBe(201)
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO roadmaps'),
      ['No desc', null, null, null, null]
    )

    const roadmap405 = createResponse()
    await roadmaps(createRequest({ method: 'DELETE' }), roadmap405)
    expect(roadmap405.statusCode).toBe(405)

    const longSearch = createResponse()
    await roadmaps(createRequest({ method: 'GET', query: { q: 'a'.repeat(101) } }), longSearch)
    expect(longSearch.statusCode).toBe(400)
    expect(longSearch.body.error).toContain('100 characters or fewer')

    const modulesWithoutRoadmap = createResponse()
    await modules(createRequest({ method: 'GET' }), modulesWithoutRoadmap)
    expect(modulesWithoutRoadmap.statusCode).toBe(200)

    const moduleMissing = createResponse()
    await modules(createRequest({ method: 'POST', body: { title: '' } }), moduleMissing)
    expect(moduleMissing.statusCode).toBe(400)

    const module405 = createResponse()
    await modules(createRequest({ method: 'DELETE' }), module405)
    expect(module405.statusCode).toBe(405)

    const lessonMissing = createResponse()
    await lessons(createRequest({ method: 'POST', body: { module_id: 1 } }), lessonMissing)
    expect(lessonMissing.statusCode).toBe(400)

    const lesson405 = createResponse()
    await lessons(createRequest({ method: 'PUT' }), lesson405)
    expect(lesson405.statusCode).toBe(405)
  })

  it('handles missing detail rows, nullable delete audit metadata and method guards', async () => {
    const db = {
      all: vi.fn().mockResolvedValue([]),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
      get: vi.fn()
        .mockResolvedValueOnce(null) // roadmap GET
        .mockResolvedValueOnce({ id: 1, title: 'AWS' }) // roadmap DELETE check
        .mockResolvedValueOnce(null) // module GET
        .mockResolvedValueOnce({ id: 1, title: 'EC2' }) // module DELETE check
        .mockResolvedValueOnce(null) // lesson GET
        .mockResolvedValueOnce({ id: 1, title: 'SSH', completed: 0 }) // lesson PUT
        .mockResolvedValueOnce({ id: 1, title: 'SSH', completed: 0 }) // lesson DELETE check
    }
    await mockContentApi(db)
    const roadmapDetail = (await import('../pages/api/roadmaps/[id]')).default
    const moduleDetail = (await import('../pages/api/modules/[id]')).default
    const lessonDetail = (await import('../pages/api/lessons/[id]')).default
    const lessonProgress = (await import('../pages/api/progress/lessons/[id]')).default
    const roadmapProgress = (await import('../pages/api/progress/roadmaps')).default

    const roadmap404 = createResponse()
    await roadmapDetail(createRequest({ method: 'GET', query: { id: '1' } }), roadmap404)
    expect(roadmap404.statusCode).toBe(404)

    const roadmapDelete = createResponse()
    await roadmapDetail(createRequest({ method: 'DELETE', query: { id: '1' } }), roadmapDelete)
    expect(roadmapDelete.statusCode).toBe(204)

    const roadmap405 = createResponse()
    await roadmapDetail(createRequest({ method: 'PATCH', query: { id: '1' } }), roadmap405)
    expect(roadmap405.statusCode).toBe(405)

    const module404 = createResponse()
    await moduleDetail(createRequest({ method: 'GET', query: { id: '1' } }), module404)
    expect(module404.statusCode).toBe(404)

    const moduleDelete = createResponse()
    await moduleDetail(createRequest({ method: 'DELETE', query: { id: '1' } }), moduleDelete)
    expect(moduleDelete.statusCode).toBe(204)

    const module405 = createResponse()
    await moduleDetail(createRequest({ method: 'PATCH', query: { id: '1' } }), module405)
    expect(module405.statusCode).toBe(405)

    const lesson404 = createResponse()
    await lessonDetail(createRequest({ method: 'GET', query: { id: '1' } }), lesson404)
    expect(lesson404.statusCode).toBe(404)

    const lessonUpdate = createResponse()
    await lessonDetail(createRequest({ method: 'PUT', query: { id: '1' }, body: { title: 'SSH', completed: false } }), lessonUpdate)
    expect(lessonUpdate.body.completed).toBe(0)

    const lessonDelete = createResponse()
    await lessonDetail(createRequest({ method: 'DELETE', query: { id: '1' } }), lessonDelete)
    expect(lessonDelete.statusCode).toBe(204)

    const lesson405 = createResponse()
    await lessonDetail(createRequest({ method: 'PATCH', query: { id: '1' } }), lesson405)
    expect(lesson405.statusCode).toBe(405)

    const progress405 = createResponse()
    await lessonProgress(createRequest({ method: 'PATCH', query: { id: '1' } }), progress405)
    expect(progress405.statusCode).toBe(405)

    const roadmapProgress405 = createResponse()
    await roadmapProgress(createRequest({ method: 'POST' }), roadmapProgress405)
    expect(roadmapProgress405.statusCode).toBe(405)
  })

  it('validates lesson progress payloads and missing rows', async () => {
    const db = {
      get: vi.fn().mockResolvedValue(null),
      run: vi.fn()
    }
    await mockContentApi(db, { user: normalUser })
    const lessonProgress = (await import('../pages/api/progress/lessons/[id]')).default

    const invalidId = createResponse()
    await lessonProgress(createRequest({ method: 'PUT', query: { id: 'NaN' }, body: { completed: true } }), invalidId)
    expect(invalidId.statusCode).toBe(400)

    const fractionalId = createResponse()
    await lessonProgress(createRequest({ method: 'PUT', query: { id: '1.5' }, body: { completed: true } }), fractionalId)
    expect(fractionalId.statusCode).toBe(400)

    const invalidBody = createResponse()
    await lessonProgress(createRequest({ method: 'PUT', query: { id: '1' }, body: { completed: 'maybe' } }), invalidBody)
    expect(invalidBody.statusCode).toBe(400)

    const invalidTime = createResponse()
    await lessonProgress(createRequest({
      method: 'PUT',
      query: { id: '1' },
      body: { completed: true, time_spent_seconds: -1 }
    }), invalidTime)
    expect(invalidTime.statusCode).toBe(400)

    const missingLesson = createResponse()
    await lessonProgress(createRequest({ method: 'PUT', query: { id: '1' }, body: { completed: true } }), missingLesson)
    expect(missingLesson.statusCode).toBe(404)
  })

  it('validates module quiz payloads and method guards', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, title: 'Empty module', roadmap_id: 7 })
        .mockResolvedValueOnce({
          id: 1,
          title: 'EC2',
          roadmap_id: 7,
          contents: '["AMI"]',
          practical_activity: '["Crear instancia"]'
        })
        .mockResolvedValueOnce({
          id: 1,
          title: 'EC2',
          roadmap_id: 7,
          contents: '["AMI"]',
          practical_activity: '["Crear instancia"]'
        })
        .mockResolvedValueOnce({
          id: 1,
          title: 'EC2',
          roadmap_id: 7,
          contents: '["AMI"]',
          practical_activity: '["Crear instancia"]'
        }),
      run: vi.fn()
    }
    await mockContentApi(db, { user: normalUser })
    const moduleQuiz = (await import('../pages/api/quizzes/modules/[id]')).default

    const invalidId = createResponse()
    await moduleQuiz(createRequest({ method: 'GET', query: { id: 'NaN' } }), invalidId)
    expect(invalidId.statusCode).toBe(400)

    const fractionalId = createResponse()
    await moduleQuiz(createRequest({ method: 'GET', query: { id: '1.5' } }), fractionalId)
    expect(fractionalId.statusCode).toBe(400)

    const missingModule = createResponse()
    await moduleQuiz(createRequest({ method: 'GET', query: { id: '1' } }), missingModule)
    expect(missingModule.statusCode).toBe(404)

    const noQuestions = createResponse()
    await moduleQuiz(createRequest({ method: 'POST', query: { id: '1' }, body: { answers: {} } }), noQuestions)
    expect(noQuestions.statusCode).toBe(422)

    const missingAnswers = createResponse()
    await moduleQuiz(createRequest({ method: 'POST', query: { id: '1' }, body: {} }), missingAnswers)
    expect(missingAnswers.statusCode).toBe(400)

    const incompleteAnswers = createResponse()
    await moduleQuiz(createRequest({
      method: 'POST',
      query: { id: '1' },
      body: { answers: { 'module-content': 0 } }
    }), incompleteAnswers)
    expect(incompleteAnswers.statusCode).toBe(400)
    expect(incompleteAnswers.body.error).toContain('answer every quiz question')

    const nullableAnswer = createResponse()
    await moduleQuiz(createRequest({
      method: 'POST',
      query: { id: '1' },
      body: { answers: { 'module-content': null, 'module-practice': 0 } }
    }), nullableAnswer)
    expect(nullableAnswer.statusCode).toBe(400)

    const methodGuard = createResponse()
    await moduleQuiz(createRequest({ method: 'DELETE', query: { id: '1' } }), methodGuard)
    expect(methodGuard.statusCode).toBe(405)
  })
})

describe('users API edge cases', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('requires admin access for listing and creating users', async () => {
    const db = { all: vi.fn(), get: vi.fn(), run: vi.fn() }
    await mockUsersApi(db, { admin: null })
    const users = (await import('../pages/api/users/index')).default

    const getRes = createResponse()
    await users(createRequest({ method: 'GET' }), getRes)
    expect(getRes.statusCode).toBe(403)

    const postRes = createResponse()
    await users(createRequest({ method: 'POST', body: { email: 'user@example.com', password: 'valid-password-123' } }), postRes)
    expect(postRes.statusCode).toBe(403)
  })

  it('validates user creation and reports storage conflicts safely', async () => {
    const db = {
      all: vi.fn(),
      get: vi.fn().mockResolvedValue({ id: 3, email: 'viewer@example.com', role: 'user', is_active: 1 }),
      run: vi.fn()
    }
    await mockUsersApi(db, {
      validatePassword: password => password === 'weak-password' ? 'weak password' : null
    })
    const users = (await import('../pages/api/users/index')).default

    const missing = createResponse()
    await users(createRequest({ method: 'POST', body: {} }), missing)
    expect(missing.statusCode).toBe(400)

    const weak = createResponse()
    await users(createRequest({ method: 'POST', body: { email: 'user@example.com', password: 'weak-password' } }), weak)
    expect(weak.statusCode).toBe(400)

    db.run.mockResolvedValueOnce({})
    const failedCreate = createResponse()
    await users(createRequest({ method: 'POST', body: { email: 'user@example.com', password: 'valid-password-123' } }), failedCreate)
    expect(failedCreate.statusCode).toBe(500)

    db.run.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 'SQLITE_CONSTRAINT' }))
    const duplicate = createResponse()
    await users(createRequest({ method: 'POST', body: { email: 'user@example.com', password: 'valid-password-123' } }), duplicate)
    expect(duplicate.statusCode).toBe(409)

    db.run.mockRejectedValueOnce(new Error('boom'))
    await expect(users(createRequest({
      method: 'POST',
      body: { email: 'user@example.com', password: 'valid-password-123' }
    }), createResponse())).rejects.toThrow('boom')

    db.run.mockResolvedValueOnce({ lastID: 3 })
    const created = createResponse()
    await users(createRequest({
      method: 'POST',
      body: { email: 'VIEWER@EXAMPLE.COM', name: '   ', role: 'owner', password: 'valid-password-123' }
    }), created)
    expect(created.statusCode).toBe(201)
    expect(db.run).toHaveBeenLastCalledWith(expect.stringContaining('INSERT INTO users'), [
      'viewer@example.com',
      null,
      'user',
      'hash',
      expect.any(String),
      expect.any(String)
    ])

    const method = createResponse()
    await users(createRequest({ method: 'DELETE' }), method)
    expect(method.statusCode).toBe(405)
  })

  it('validates user admin actions and protects sensitive states', async () => {
    const db = {
      run: vi.fn().mockResolvedValue({ changes: 1 }), // Default return value for UPDATEs/DELETEs
      get: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, email: 'admin@example.com', role: 'admin', is_active: 1 })
        .mockResolvedValueOnce({ id: 2, email: 'other-admin@example.com', role: 'admin', is_active: 1 })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ id: 2, email: 'other-admin@example.com', role: 'admin', is_active: 0 })
        .mockResolvedValueOnce(normalUser)
        .mockResolvedValueOnce(normalUser)
        .mockResolvedValueOnce(normalUser)
        .mockResolvedValueOnce(normalUser)
        .mockResolvedValueOnce({ ...normalUser, is_active: 1 })
    }
    await mockUsersApi(db, {
      validatePassword: password => password === 'weak-password' ? 'weak password' : null
    })
    const userDetail = (await import('../pages/api/users/[id]')).default

    const method = createResponse()
    await userDetail(createRequest({ method: 'GET', query: { id: '2' } }), method)
    expect(method.statusCode).toBe(405)

    const invalidId = createResponse()
    await userDetail(createRequest({ method: 'PATCH', query: { id: 'NaN' }, body: { action: 'set_active' } }), invalidId)
    expect(invalidId.statusCode).toBe(400)

    const missing = createResponse()
    await userDetail(createRequest({ method: 'PATCH', query: { id: '99' }, body: { action: 'set_active' } }), missing)
    expect(missing.statusCode).toBe(404)

    const selfDeactivate = createResponse()
    await userDetail(createRequest({ method: 'PATCH', query: { id: '1' }, body: { action: 'set_active', is_active: false } }), selfDeactivate)
    expect(selfDeactivate.statusCode).toBe(400)

    const otherAdminDeactivate = createResponse()
    await userDetail(createRequest({ method: 'PATCH', query: { id: '2' }, body: { action: 'set_active', is_active: false } }), otherAdminDeactivate)
    expect(otherAdminDeactivate.statusCode).toBe(200)

    const resetMissingPassword = createResponse()
    await userDetail(createRequest({ method: 'PATCH', query: { id: '2' }, body: { action: 'reset_password' } }), resetMissingPassword)
    expect(resetMissingPassword.statusCode).toBe(400)

    const resetWeakPassword = createResponse()
    await userDetail(createRequest({ method: 'PATCH', query: { id: '2' }, body: { action: 'reset_password', password: 'weak-password' } }), resetWeakPassword)
    expect(resetWeakPassword.statusCode).toBe(400)

    const unsupported = createResponse()
    await userDetail(createRequest({ method: 'PATCH', query: { id: '2' }, body: { action: 'rename' } }), unsupported)
    expect(unsupported.statusCode).toBe(400)

    const resetOk = createResponse()
    await userDetail(createRequest({ method: 'PATCH', query: { id: ['2'] }, body: { action: 'reset_password', password: 'valid-password-123' } }), resetOk)
    expect(resetOk.statusCode).toBe(200)
  })

  it('stops user detail actions when admin authorization fails', async () => {
    const db = { run: vi.fn().mockResolvedValue({ changes: 1 }), get: vi.fn() }
    await mockUsersApi(db, { admin: null })
    const userDetail = (await import('../pages/api/users/[id]')).default

    const res = createResponse()
    await userDetail(createRequest({ method: 'PATCH', query: { id: '2' }, body: { action: 'reset_password' } }), res)
    expect(res.statusCode).toBe(403)
  })
})

describe('auth API edge cases', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    delete process.env.AUTH_SETUP_TOKEN
  })

  it('validates login requests and failed password checks', async () => {
    const db = {
      get: vi.fn().mockResolvedValue({ id: 1, email: 'admin@example.com', role: 'admin', password_hash: 'hash' }),
      run: vi.fn()
    }
    await mockAuthApi(db, { verifiedPassword: false })
    const login = (await import('../pages/api/auth/login')).default

    const method = createResponse()
    await login(createRequest({ method: 'GET' }), method)
    expect(method.statusCode).toBe(405)

    const missing = createResponse()
    await login(createRequest({ method: 'POST', body: {} }), missing)
    expect(missing.statusCode).toBe(400)

    const badPassword = createResponse()
    await login(createRequest({ method: 'POST', body: { email: 'admin@example.com', password: 'wrong-password' } }), badPassword)
    expect(badPassword.statusCode).toBe(401)
  })

  it('uses same-origin protection for login and logout', async () => {
    const db = { get: vi.fn(), run: vi.fn().mockResolvedValue({ changes: 1 }) }
    await mockAuthApi(db, { sameOrigin: false })
    const login = (await import('../pages/api/auth/login')).default
    const logout = (await import('../pages/api/auth/logout')).default

    const loginRes = createResponse()
    await login(createRequest({ method: 'POST', body: { email: 'admin@example.com', password: 'valid-password-123' } }), loginRes)
    expect(loginRes.statusCode).toBe(403)

    const logoutRes = createResponse()
    await logout(createRequest({ method: 'POST' }), logoutRes)
    expect(logoutRes.statusCode).toBe(403)
  })

  it('returns method guards for session and setup status endpoints', async () => {
    const db = { get: vi.fn(), run: vi.fn().mockResolvedValue({ changes: 1 }) }
    await mockAuthApi(db)
    const logout = (await import('../pages/api/auth/logout')).default
    const me = (await import('../pages/api/auth/me')).default
    const setupStatus = (await import('../pages/api/auth/setup-status')).default

    const logoutMethod = createResponse()
    await logout(createRequest({ method: 'GET' }), logoutMethod)
    expect(logoutMethod.statusCode).toBe(405)

    const meMethod = createResponse()
    await me(createRequest({ method: 'POST' }), meMethod)
    expect(meMethod.statusCode).toBe(405)

    const statusMethod = createResponse()
    await setupStatus(createRequest({ method: 'POST' }), statusMethod)
    expect(statusMethod.statusCode).toBe(405)
  })

  it('validates setup flow preconditions and creation failures', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 }),
      run: vi.fn().mockResolvedValue({ changes: 1, lastID: 1 })
    }
    await mockAuthApi(db, { passwordError: 'weak password' })
    const setup = (await import('../pages/api/auth/setup')).default

    const method = createResponse()
    await setup(createRequest({ method: 'GET' }), method)
    expect(method.statusCode).toBe(405)

    const completed = createResponse()
    await setup(createRequest({ method: 'POST', body: {} }), completed)
    expect(completed.statusCode).toBe(409)

    const missing = createResponse()
    await setup(createRequest({ method: 'POST', body: { setupToken: 123 } }), missing)
    expect(missing.statusCode).toBe(400)

    const weak = createResponse()
    await setup(createRequest({
      method: 'POST',
      body: { email: 'admin@example.com', password: 'valid-password-123', name: 'Admin' }
    }), weak)
    expect(weak.statusCode).toBe(400)

    const failed = createResponse()
    await setup(createRequest({
      method: 'POST',
      body: { email: 'ADMIN@EXAMPLE.COM', name: '   ', password: 'valid-password-123' }
    }), failed)
    expect(failed.statusCode).toBe(400)
  })

  it('rejects setup when origin or setup token are invalid', async () => {
    await mockAuthApi({ get: vi.fn(), run: vi.fn() }, { sameOrigin: false })
    const setupOrigin = (await import('../pages/api/auth/setup')).default
    const origin = createResponse()
    await setupOrigin(createRequest({ method: 'POST' }), origin)
    expect(origin.statusCode).toBe(403)

    await mockAuthApi({ get: vi.fn().mockResolvedValue({ count: 0 }), run: vi.fn() }, { setupToken: false })
    const setupToken = (await import('../pages/api/auth/setup')).default
    const token = createResponse()
    await setupToken(createRequest({
      method: 'POST',
      body: { email: 'admin@example.com', password: 'valid-password-123', setupToken: 123 }
    }), token)
    expect(token.statusCode).toBe(403)
  })
})
