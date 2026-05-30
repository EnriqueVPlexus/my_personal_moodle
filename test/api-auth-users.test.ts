import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest, createResponse } from './helpers/api'

const admin = { id: 1, email: 'admin@example.com', role: 'admin' as const }

async function mockBase(db: any) {
  vi.resetModules()
  vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
  vi.doMock('../lib/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
}

describe('auth API handlers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    delete process.env.AUTH_SETUP_TOKEN
  })

  it('logs users in and rejects invalid credentials', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({ id: 1, email: 'admin@example.com', role: 'admin', password_hash: 'hash' })
        .mockResolvedValueOnce(null),
      run: vi.fn()
    }
    await mockBase(db)
    vi.doMock('../lib/password', () => ({
      normalizeEmail: (email: string) => email.toLowerCase(),
      verifyPassword: vi.fn().mockResolvedValue(true)
    }))
    vi.doMock('../lib/auth', async () => ({
      ...(await vi.importActual('../lib/auth') as any),
      createSession: vi.fn().mockImplementation((_res: any) => _res.setHeader('Set-Cookie', 'moodle_session=token')),
      requireSameOrigin: vi.fn().mockReturnValue(true)
    }))
    const handler = (await import('../pages/api/auth/login')).default

    const okRes = createResponse()
    await handler(createRequest({ method: 'POST', body: { email: 'ADMIN@EXAMPLE.COM', password: 'valid-password' } }), okRes)
    expect(okRes.statusCode).toBe(200)
    expect(okRes.body.user.email).toBe('admin@example.com')

    const badRes = createResponse()
    await handler(createRequest({ method: 'POST', body: { email: 'missing@example.com', password: 'bad' } }), badRes)
    expect(badRes.statusCode).toBe(401)
  })

  it('returns current session and logs out', async () => {
    const db = { run: vi.fn() }
    await mockBase(db)
    vi.doMock('../lib/auth', async () => ({
      ...(await vi.importActual('../lib/auth') as any),
      getUserFromRequest: vi.fn().mockResolvedValue(admin),
      clearSession: vi.fn().mockImplementation((_req: any, res: any) => res.setHeader('Set-Cookie', 'moodle_session=; Max-Age=0')),
      requireSameOrigin: vi.fn().mockReturnValue(true)
    }))

    const me = (await import('../pages/api/auth/me')).default
    const logout = (await import('../pages/api/auth/logout')).default

    const meRes = createResponse()
    await me(createRequest({ method: 'GET' }), meRes)
    expect(meRes.body.user).toEqual(admin)

    const logoutRes = createResponse()
    await logout(createRequest({ method: 'POST' }), logoutRes)
    expect(logoutRes.body).toEqual({ ok: true })
  })

  it('reports setup status and creates the first admin', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 }),
      run: vi.fn().mockResolvedValue({ lastID: 1 })
    }
    await mockBase(db)
    vi.doMock('../lib/password', () => ({
      normalizeEmail: (email: string) => email.toLowerCase(),
      validatePassword: vi.fn().mockReturnValue(null),
      hashPassword: vi.fn().mockResolvedValue('hash')
    }))
    vi.doMock('../lib/auth', async () => ({
      ...(await vi.importActual('../lib/auth') as any),
      createSession: vi.fn().mockImplementation((_res: any) => _res.setHeader('Set-Cookie', 'moodle_session=token')),
      requireSameOrigin: vi.fn().mockReturnValue(true),
      validateSetupToken: vi.fn().mockReturnValue(true)
    }))

    const status = (await import('../pages/api/auth/setup-status')).default
    const setup = (await import('../pages/api/auth/setup')).default

    const statusRes = createResponse()
    await status(createRequest({ method: 'GET' }), statusRes)
    expect(statusRes.body.needsSetup).toBe(true)

    const setupRes = createResponse()
    await setup(createRequest({
      method: 'POST',
      body: { email: 'ADMIN@EXAMPLE.COM', name: 'Admin', password: 'valid-password-123' }
    }), setupRes)
    expect(setupRes.statusCode).toBe(201)
    expect(setupRes.body.user.role).toBe('admin')
  })
})

describe('users API handlers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('lists and creates users as admin', async () => {
    const db = {
      all: vi.fn().mockResolvedValue([{ id: 1, email: 'admin@example.com' }]),
      run: vi.fn().mockResolvedValue({ lastID: 2 }),
      get: vi.fn().mockResolvedValue({ id: 2, email: 'user@example.com', role: 'user', is_active: 1 })
    }
    await mockBase(db)
    vi.doMock('../lib/auth', () => ({
      isValidRole: (role: unknown) => role === 'admin' || role === 'user',
      requireAdmin: vi.fn().mockResolvedValue(admin)
    }))
    vi.doMock('../lib/password', () => ({
      normalizeEmail: (email: string) => email.toLowerCase(),
      validatePassword: vi.fn().mockReturnValue(null),
      hashPassword: vi.fn().mockResolvedValue('hash')
    }))
    const handler = (await import('../pages/api/users/index')).default

    const getRes = createResponse()
    await handler(createRequest({ method: 'GET' }), getRes)
    expect(getRes.body).toEqual([
      expect.objectContaining({
        id: 1,
        email: 'admin@example.com',
        can_view_all_roadmaps: 1,
        roadmap_access_ids: []
      })
    ])

    const postRes = createResponse()
    await handler(createRequest({
      method: 'POST',
      body: { email: 'USER@EXAMPLE.COM', role: 'user', password: 'valid-password-123' }
    }), postRes)
    expect(postRes.statusCode).toBe(201)
    expect(postRes.body.email).toBe('user@example.com')
  })

  it('deactivates, reactivates and resets passwords', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({ id: 2, email: 'user@example.com', role: 'user', is_active: 1 })
        .mockResolvedValueOnce({ id: 2, email: 'user@example.com', role: 'user', is_active: 0 })
        .mockResolvedValueOnce({ id: 2, email: 'user@example.com', role: 'user', is_active: 0 })
        .mockResolvedValueOnce({ id: 2, email: 'user@example.com', role: 'user', is_active: 1 })
        .mockResolvedValueOnce({ id: 2, email: 'user@example.com', role: 'user', is_active: 1 })
        .mockResolvedValueOnce({ id: 2, email: 'user@example.com', role: 'user', is_active: 1 }),
      run: vi.fn()
    }
    await mockBase(db)
    vi.doMock('../lib/auth', () => ({ requireAdmin: vi.fn().mockResolvedValue(admin) }))
    vi.doMock('../lib/password', () => ({
      validatePassword: vi.fn().mockReturnValue(null),
      hashPassword: vi.fn().mockResolvedValue('hash')
    }))
    const handler = (await import('../pages/api/users/[id]')).default

    const deactivateRes = createResponse()
    await handler(createRequest({ method: 'PATCH', query: { id: '2' }, body: { action: 'set_active', is_active: false } }), deactivateRes)
    expect(deactivateRes.statusCode).toBe(200)

    const activateRes = createResponse()
    await handler(createRequest({ method: 'PATCH', query: { id: '2' }, body: { action: 'set_active', is_active: true } }), activateRes)
    expect(activateRes.statusCode).toBe(200)

    const resetRes = createResponse()
    await handler(createRequest({ method: 'PATCH', query: { id: '2' }, body: { action: 'reset_password', password: 'new-password-123' } }), resetRes)
    expect(resetRes.statusCode).toBe(200)
  })

  it('updates per-user roadmap access for non-admin users', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({ id: 2, email: 'user@example.com', role: 'user', is_active: 1 })
        .mockResolvedValueOnce({ id: 2, email: 'user@example.com', role: 'user', is_active: 1, can_view_all_roadmaps: 0 }),
      all: vi.fn()
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
        .mockResolvedValueOnce([{ roadmap_id: 1 }, { roadmap_id: 2 }]),
      run: vi.fn()
    }
    await mockBase(db)
    vi.doMock('../lib/auth', () => ({ requireAdmin: vi.fn().mockResolvedValue(admin) }))
    const handler = (await import('../pages/api/users/[id]')).default

    const res = createResponse()
    await handler(createRequest({
      method: 'PATCH',
      query: { id: '2' },
      body: { action: 'set_roadmap_access', can_view_all_roadmaps: false, roadmap_ids: [1, 2, 2] }
    }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.roadmap_access_ids).toEqual([1, 2])
    expect(db.run).toHaveBeenCalledWith(
      'UPDATE users SET can_view_all_roadmaps = ?, updated_at = ? WHERE id = ?',
      [0, expect.any(String), 2]
    )
    expect(db.run).toHaveBeenCalledWith(
      'INSERT OR IGNORE INTO user_roadmap_access (user_id, roadmap_id, created_at) VALUES (?, ?, ?)',
      [2, 1, expect.any(String)]
    )
  })

  it('protects the last active admin from deactivation', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({ id: 2, email: 'other@example.com', role: 'admin', is_active: 1 })
        .mockResolvedValueOnce({ count: 0 }),
      run: vi.fn()
    }
    await mockBase(db)
    vi.doMock('../lib/auth', () => ({ requireAdmin: vi.fn().mockResolvedValue(admin) }))
    const handler = (await import('../pages/api/users/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'PATCH', query: { id: '2' }, body: { action: 'set_active', is_active: false } }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toContain('last active admin')
  })
})
