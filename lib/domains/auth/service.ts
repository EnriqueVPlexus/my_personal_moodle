import { randomBytes } from 'crypto'
import { hashPassword, normalizeEmail, verifyPassword } from './password'
import { hashToken, isValidRole } from './policy'
import type { AccountRepository, RateLimitRepository, SessionRepository } from './ports'
import type {
  AuthResult,
  AuthRole,
  AuthUser,
  FirstAdminResult,
  LoginResult,
  RateLimitPolicy,
  RoadmapReadScope
} from './types'

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export type AuthServicePorts = {
  sessions: SessionRepository
  accounts: AccountRepository
  rateLimits: RateLimitRepository
}

export type AuthServiceConfig = {
  /** Whether read endpoints require a session (REQUIRE_AUTH_FOR_READS). */
  readAuthRequired: () => boolean
  now?: () => Date
}

export type AuthService = ReturnType<typeof makeAuthService>

export function makeAuthService(ports: AuthServicePorts, config: AuthServiceConfig) {
  const { sessions, accounts, rateLimits } = ports
  const now = config.now ?? (() => new Date())

  async function authenticate(token: string | undefined): Promise<AuthUser | null> {
    if (!token) return null

    const nowIso = now().toISOString()
    const tokenHash = hashToken(token)
    const user = await sessions.findActiveUser(tokenHash, nowIso)

    if (!user || !isValidRole(user.role)) return null

    await sessions.touch(tokenHash, nowIso)
    return user as AuthUser
  }

  return {
    authenticate,

    async startSession(userId: number) {
      const token = randomBytes(32).toString('base64url')
      const current = now()
      const expiresAt = new Date(current.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString()

      await sessions.deleteExpired(current.toISOString())
      await sessions.insert({
        userId,
        tokenHash: hashToken(token),
        expiresAt,
        nowIso: current.toISOString()
      })

      return { token, maxAgeSeconds: SESSION_MAX_AGE_SECONDS }
    },

    async endSession(token: string | undefined) {
      if (token) await sessions.deleteByTokenHash(hashToken(token))
    },

    /** Authenticates and checks the role; does not know about HTTP. */
    async authorize(token: string | undefined, role: AuthRole): Promise<AuthResult<AuthUser>> {
      const user = await authenticate(token)
      if (!user) return { ok: false, reason: 'unauthenticated' }
      if (role === 'admin' && user.role !== 'admin') return { ok: false, reason: 'forbidden' }
      return { ok: true, value: user }
    },

    async authorizeRead(token: string | undefined): Promise<AuthResult<null>> {
      if (!config.readAuthRequired()) return { ok: true, value: null }
      const user = await authenticate(token)
      if (!user) return { ok: false, reason: 'unauthenticated' }
      return { ok: true, value: null }
    },

    async resolveReadScope(token: string | undefined): Promise<AuthResult<RoadmapReadScope>> {
      const user = await authenticate(token)

      if (!user) {
        if (!config.readAuthRequired()) {
          return { ok: true, value: { user: null, allRoadmaps: true, roadmapIds: [] } }
        }
        return { ok: false, reason: 'unauthenticated' }
      }

      if (user.role === 'admin') {
        return { ok: true, value: { user, allRoadmaps: true, roadmapIds: [] } }
      }

      const settings = await accounts.findReadSettings(user.id)
      if (!settings) return { ok: false, reason: 'unauthenticated' }

      if (Number(settings.can_view_all_roadmaps) !== 0) {
        return { ok: true, value: { user, allRoadmaps: true, roadmapIds: [] } }
      }

      const ids = await accounts.listAccessibleRoadmapIds(user.id)
      return { ok: true, value: { user, allRoadmaps: false, roadmapIds: ids } }
    },

    async login(email: string, password: string): Promise<LoginResult> {
      const user = await accounts.findActiveLoginUser(normalizeEmail(email))
      if (!user || !(await verifyPassword(password, user.password_hash))) return { ok: false }
      return {
        ok: true,
        user: { id: user.id, email: user.email, name: user.name, role: user.role }
      }
    },

    async needsSetup() {
      return (await accounts.countUsers()) === 0
    },

    async createFirstAdmin(input: { email: string; name?: string | null; password: string }): Promise<FirstAdminResult> {
      if ((await accounts.countUsers()) > 0) return { status: 'already_configured' }

      const userId = await accounts.insertAdmin({
        email: input.email,
        name: input.name || null,
        passwordHash: await hashPassword(input.password),
        nowIso: now().toISOString()
      })
      if (!userId) return { status: 'failed' }

      return { status: 'created', userId }
    },

    /** Records an attempt for `key` and reports whether it is still allowed. */
    async registerAttempt(key: string, policy: RateLimitPolicy): Promise<{ allowed: boolean }> {
      const nowMs = now().getTime()
      const existing = await rateLimits.find(key)

      const isExpired = !existing || new Date(existing.reset_at).getTime() <= nowMs
      const nextCount = isExpired ? 1 : Number(existing.attempt_count) + 1
      const nextResetAt = isExpired ? new Date(nowMs + policy.windowMs).toISOString() : existing.reset_at

      if (existing) await rateLimits.update(key, nextCount, nextResetAt)
      else await rateLimits.insert(key, nextCount, nextResetAt)

      return { allowed: nextCount <= policy.maxAttempts }
    },

    clearAttempts(key: string) {
      return rateLimits.remove(key)
    }
  }
}
