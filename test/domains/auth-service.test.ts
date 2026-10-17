import { describe, expect, it } from 'vitest'
import { makeAuthService } from '../../lib/domains/auth/service'
import { hashToken, isSetupTokenValid, scopeAllowsRoadmap } from '../../lib/domains/auth/policy'
import { hashPassword } from '../../lib/domains/auth/password'
import type {
  AccountRepository,
  LoginUserRow,
  RateLimitRepository,
  RateLimitRow,
  SessionRepository,
  SessionUserRow
} from '../../lib/domains/auth/ports'

type FakeState = {
  sessions: Array<{ userId: number; tokenHash: string; expiresAt: string; lastSeen: string }>
  users: Array<LoginUserRow & { is_active: number; can_view_all_roadmaps: number }>
  access: Array<{ user_id: number; roadmap_id: number }>
  limits: Map<string, RateLimitRow>
}

function createFakes(now: () => Date) {
  const state: FakeState = { sessions: [], users: [], access: [], limits: new Map() }

  const sessions: SessionRepository = {
    async deleteExpired(nowIso) {
      state.sessions = state.sessions.filter(session => session.expiresAt > nowIso)
    },
    async insert({ userId, tokenHash, expiresAt, nowIso }) {
      state.sessions.push({ userId, tokenHash, expiresAt, lastSeen: nowIso })
    },
    async deleteByTokenHash(tokenHash) {
      state.sessions = state.sessions.filter(session => session.tokenHash !== tokenHash)
    },
    async findActiveUser(tokenHash, nowIso): Promise<SessionUserRow | undefined> {
      const session = state.sessions.find(item => item.tokenHash === tokenHash && item.expiresAt > nowIso)
      const user = state.users.find(item => item.id === session?.userId && item.is_active === 1)
      return user ? { id: user.id, email: user.email, name: user.name, role: user.role } : undefined
    },
    async touch(tokenHash, nowIso) {
      const session = state.sessions.find(item => item.tokenHash === tokenHash)
      if (session) session.lastSeen = nowIso
    }
  }

  const accounts: AccountRepository = {
    async findActiveLoginUser(email) {
      return state.users.find(user => user.email === email && user.is_active === 1)
    },
    async findReadSettings(userId) {
      const user = state.users.find(item => item.id === userId && item.is_active === 1)
      return user ? { can_view_all_roadmaps: user.can_view_all_roadmaps } : undefined
    },
    async listAccessibleRoadmapIds(userId) {
      return state.access.filter(row => row.user_id === userId).map(row => row.roadmap_id)
    },
    async countUsers() {
      return state.users.length
    },
    async insertAdmin({ email, name, passwordHash }) {
      const id = state.users.length + 1
      state.users.push({
        id, email, name, role: 'admin', password_hash: passwordHash, is_active: 1, can_view_all_roadmaps: 1
      })
      return id
    }
  }

  const rateLimits: RateLimitRepository = {
    async find(key) {
      return state.limits.get(key)
    },
    async update(key, attemptCount, resetAt) {
      state.limits.set(key, { attempt_count: attemptCount, reset_at: resetAt })
    },
    async insert(key, attemptCount, resetAt) {
      state.limits.set(key, { attempt_count: attemptCount, reset_at: resetAt })
    },
    async remove(key) {
      state.limits.delete(key)
    }
  }

  return { state, ports: { sessions, accounts, rateLimits }, now }
}

function setup(options: { readAuthRequired?: boolean } = {}) {
  let current = new Date('2026-01-01T00:00:00.000Z')
  const fakes = createFakes(() => current)
  const service = makeAuthService(fakes.ports, {
    readAuthRequired: () => options.readAuthRequired ?? false,
    now: () => current
  })
  return {
    ...fakes,
    service,
    advance(ms: number) {
      current = new Date(current.getTime() + ms)
    }
  }
}

function addUser(
  state: FakeState,
  user: Partial<FakeState['users'][number]> & Pick<FakeState['users'][number], 'id' | 'role'>
) {
  state.users.push({
    email: `user${user.id}@example.com`,
    name: null,
    password_hash: '',
    is_active: 1,
    can_view_all_roadmaps: 1,
    ...user
  })
}

describe('auth service: sessions and authorization', () => {
  it('starts a session, authenticates with its token and ends it', async () => {
    const { service, state } = setup()
    addUser(state, { id: 1, role: 'admin' })

    const { token } = await service.startSession(1)
    expect(state.sessions[0].tokenHash).toBe(hashToken(token))
    expect(await service.authenticate(token)).toMatchObject({ id: 1, role: 'admin' })

    await service.endSession(token)
    expect(await service.authenticate(token)).toBeNull()
  })

  it('rejects missing tokens, expired sessions and unknown roles', async () => {
    const { service, state, advance } = setup()
    addUser(state, { id: 1, role: 'user' })
    addUser(state, { id: 2, role: 'owner' as never })

    expect(await service.authenticate(undefined)).toBeNull()

    const { token, maxAgeSeconds } = await service.startSession(1)
    advance((maxAgeSeconds + 1) * 1000)
    expect(await service.authenticate(token)).toBeNull()

    const { token: ownerToken } = await service.startSession(2)
    expect(await service.authenticate(ownerToken)).toBeNull()
  })

  it('distinguishes unauthenticated from forbidden when checking the admin role', async () => {
    const { service, state } = setup()
    addUser(state, { id: 1, role: 'admin' })
    addUser(state, { id: 2, role: 'user' })
    const admin = await service.startSession(1)
    const user = await service.startSession(2)

    expect(await service.authorize('missing', 'admin')).toEqual({ ok: false, reason: 'unauthenticated' })
    expect(await service.authorize(user.token, 'admin')).toEqual({ ok: false, reason: 'forbidden' })
    expect(await service.authorize(user.token, 'user')).toMatchObject({ ok: true })
    expect(await service.authorize(admin.token, 'admin')).toMatchObject({ ok: true })
  })

  it('only requires a session for reads when configured', async () => {
    const open = setup()
    expect(await open.service.authorizeRead(undefined)).toEqual({ ok: true, value: null })

    const closed = setup({ readAuthRequired: true })
    expect(await closed.service.authorizeRead(undefined)).toEqual({ ok: false, reason: 'unauthenticated' })
  })
})

describe('auth service: roadmap read scope', () => {
  it('gives anonymous visitors full access unless reads require auth', async () => {
    const open = setup()
    expect(await open.service.resolveReadScope(undefined)).toEqual({
      ok: true,
      value: { user: null, allRoadmaps: true, roadmapIds: [] }
    })

    const closed = setup({ readAuthRequired: true })
    expect(await closed.service.resolveReadScope(undefined)).toEqual({ ok: false, reason: 'unauthenticated' })
  })

  it('always gives admins full access, even with restricted flags', async () => {
    const { service, state } = setup()
    addUser(state, { id: 1, role: 'admin', can_view_all_roadmaps: 0 })
    const { token } = await service.startSession(1)

    const result = await service.resolveReadScope(token)
    expect(result).toMatchObject({ ok: true, value: { allRoadmaps: true, roadmapIds: [] } })
  })

  it('restricts users to their granted roadmaps', async () => {
    const { service, state } = setup()
    addUser(state, { id: 2, role: 'user', can_view_all_roadmaps: 0 })
    state.access.push({ user_id: 2, roadmap_id: 7 }, { user_id: 2, roadmap_id: 8 }, { user_id: 3, roadmap_id: 9 })
    const { token } = await service.startSession(2)

    const result = await service.resolveReadScope(token)
    if (!result.ok) throw new Error('expected a scope')
    expect(result.value).toMatchObject({ allRoadmaps: false, roadmapIds: [7, 8] })
    expect(scopeAllowsRoadmap(result.value, '7')).toBe(true)
    expect(scopeAllowsRoadmap(result.value, ['8'])).toBe(true)
    expect(scopeAllowsRoadmap(result.value, '9')).toBe(false)
  })
})

describe('auth service: login and first-run setup', () => {
  it('logs in with a normalized email and a valid password only', async () => {
    const { service, state } = setup()
    addUser(state, {
      id: 1,
      role: 'user',
      email: 'ana@example.com',
      name: 'Ana',
      password_hash: await hashPassword('correct-horse-battery')
    })

    expect(await service.login('  ANA@example.com ', 'correct-horse-battery')).toEqual({
      ok: true,
      user: { id: 1, email: 'ana@example.com', name: 'Ana', role: 'user' }
    })
    expect(await service.login('ana@example.com', 'wrong-password-123')).toEqual({ ok: false })
    expect(await service.login('nobody@example.com', 'correct-horse-battery')).toEqual({ ok: false })
  })

  it('creates the first admin once and refuses afterwards', async () => {
    const { service, state } = setup()
    expect(await service.needsSetup()).toBe(true)

    const created = await service.createFirstAdmin({ email: 'root@example.com', name: 'Root', password: 'a-valid-password-1' })
    expect(created).toEqual({ status: 'created', userId: 1 })
    expect(state.users[0]).toMatchObject({ role: 'admin', email: 'root@example.com' })
    expect(await service.needsSetup()).toBe(false)

    expect(await service.createFirstAdmin({ email: 'other@example.com', password: 'a-valid-password-1' }))
      .toEqual({ status: 'already_configured' })
  })

  it('validates setup tokens in constant time and defaults by environment', () => {
    expect(isSetupTokenValid('secret', 'secret', true)).toBe(true)
    expect(isSetupTokenValid('Secret', 'secret', true)).toBe(false)
    expect(isSetupTokenValid(undefined, 'secret', false)).toBe(false)
    expect(isSetupTokenValid(undefined, undefined, false)).toBe(true)
    expect(isSetupTokenValid(undefined, undefined, true)).toBe(false)
  })
})

describe('auth service: rate limiting', () => {
  it('blocks after the maximum attempts and resets after the window', async () => {
    const { service, advance } = setup()
    const policy = { maxAttempts: 2, windowMs: 60_000 }

    expect((await service.registerAttempt('login:1.1.1.1', policy)).allowed).toBe(true)
    expect((await service.registerAttempt('login:1.1.1.1', policy)).allowed).toBe(true)
    expect((await service.registerAttempt('login:1.1.1.1', policy)).allowed).toBe(false)
    expect((await service.registerAttempt('login:2.2.2.2', policy)).allowed).toBe(true)

    advance(61_000)
    expect((await service.registerAttempt('login:1.1.1.1', policy)).allowed).toBe(true)
  })

  it('clears a bucket after a successful authentication', async () => {
    const { service } = setup()
    const policy = { maxAttempts: 1, windowMs: 60_000 }
    await service.registerAttempt('setup:ip', policy)
    await service.clearAttempts('setup:ip')

    expect((await service.registerAttempt('setup:ip', policy)).allowed).toBe(true)
  })
})
