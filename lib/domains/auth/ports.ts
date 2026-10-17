export type SessionUserRow = {
  id: number
  email: string
  name: string | null
  role: string
}

export type LoginUserRow = SessionUserRow & { password_hash: string }

export type RateLimitRow = { attempt_count: number; reset_at: string }

/** Session storage the auth service depends on. */
export interface SessionRepository {
  deleteExpired(nowIso: string): Promise<void>
  insert(session: { userId: number; tokenHash: string; expiresAt: string; nowIso: string }): Promise<void>
  deleteByTokenHash(tokenHash: string): Promise<void>
  findActiveUser(tokenHash: string, nowIso: string): Promise<SessionUserRow | undefined | null>
  touch(tokenHash: string, nowIso: string): Promise<void>
}

/** Account lookups needed for login, read scopes and first-run setup. */
export interface AccountRepository {
  findActiveLoginUser(email: string): Promise<LoginUserRow | undefined | null>
  findReadSettings(userId: number): Promise<{ can_view_all_roadmaps: number } | undefined | null>
  listAccessibleRoadmapIds(userId: number): Promise<number[]>
  countUsers(): Promise<number>
  insertAdmin(input: { email: string; name: string | null; passwordHash: string; nowIso: string }): Promise<number | undefined>
}

export interface RateLimitRepository {
  find(key: string): Promise<RateLimitRow | undefined | null>
  update(key: string, attemptCount: number, resetAt: string): Promise<void>
  insert(key: string, attemptCount: number, resetAt: string): Promise<void>
  remove(key: string): Promise<void>
}
