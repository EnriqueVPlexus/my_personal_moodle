export type AuthRole = 'admin' | 'user'

export type AuthUser = {
  id: number
  email: string
  name?: string | null
  role: AuthRole
}

/** Why an access check failed. The HTTP layer decides how to present it. */
export type AuthFailure = 'unauthenticated' | 'forbidden'

export type AuthResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: AuthFailure }

export type RoadmapReadScope = {
  user: AuthUser | null
  allRoadmaps: boolean
  roadmapIds: number[]
}

export type LoginResult =
  | { ok: true; user: { id: number; email: string; name: string | null; role: string } }
  | { ok: false }

export type FirstAdminResult =
  | { status: 'created'; userId: number }
  | { status: 'already_configured' }
  | { status: 'failed' }

export type RateLimitPolicy = {
  maxAttempts: number
  windowMs: number
}
