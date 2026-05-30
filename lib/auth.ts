import type { NextApiRequest, NextApiResponse } from 'next'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { openDb } from './db'

export type AuthRole = 'admin' | 'user'

export type AuthUser = {
  id: number
  email: string
  name?: string | null
  role: AuthRole
}

const SESSION_COOKIE = 'moodle_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

function cookieSecureFlag() {
  return process.env.NODE_ENV === 'production' ? '; Secure' : ''
}

function sessionCookie(token: string, maxAge: number) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${cookieSecureFlag()}`
}

function parseCookies(req: NextApiRequest) {
  const cookieHeader = req.headers.cookie || ''
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map(cookie => cookie.trim())
      .filter(Boolean)
      .map(cookie => {
        const [name, ...valueParts] = cookie.split('=')
        return [name, decodeURIComponent(valueParts.join('='))]
      })
  )
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function getHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function secureCompare(a: string, b: string) {
  const first = Buffer.from(a)
  const second = Buffer.from(b)
  return first.length === second.length && timingSafeEqual(first, second)
}

export function isValidRole(role: unknown): role is AuthRole {
  return role === 'admin' || role === 'user'
}

export async function createSession(res: NextApiResponse, userId: number, db?: any) {
  const database = db || await openDb()
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString()

  await database.run('DELETE FROM sessions WHERE expires_at <= ?', [now.toISOString()])
  await database.run(
    'INSERT INTO sessions (user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
    [userId, hashToken(token), expiresAt, now.toISOString(), now.toISOString()]
  )

  res.setHeader('Set-Cookie', sessionCookie(token, SESSION_MAX_AGE_SECONDS))
}

export async function clearSession(req: NextApiRequest, res: NextApiResponse, db?: any) {
  const database = db || await openDb()
  const token = parseCookies(req)[SESSION_COOKIE]

  if (token) {
    await database.run('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)])
  }

  res.setHeader('Set-Cookie', sessionCookie('', 0))
}

export async function getUserFromRequest(req: NextApiRequest, db?: any): Promise<AuthUser | null> {
  const token = parseCookies(req)[SESSION_COOKIE]
  if (!token) return null

  const database = db || await openDb()
  const now = new Date().toISOString()
  const user = await database.get(
    `SELECT users.id, users.email, users.name, users.role
     FROM sessions
     INNER JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ?
       AND sessions.expires_at > ?
       AND users.is_active = 1`,
    [hashToken(token), now]
  )

  if (!user || !isValidRole(user.role)) return null

  await database.run('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?', [now, hashToken(token)])
  return user
}

export function requireSameOrigin(req: NextApiRequest, res: NextApiResponse) {
  const method = req.method || 'GET'
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return true

  const origin = getHeaderValue(req.headers.origin)
  if (!origin) return true

  const forwardedHost = getHeaderValue(req.headers['x-forwarded-host'])
  const host = forwardedHost || getHeaderValue(req.headers.host)
  if (!host) {
    res.status(403).json({ error: 'origin check failed' })
    return false
  }

  try {
    if (new URL(origin).host === host) return true
  } catch {
    res.status(403).json({ error: 'invalid origin' })
    return false
  }

  res.status(403).json({ error: 'origin not allowed' })
  return false
}

export async function requireAdmin(req: NextApiRequest, res: NextApiResponse, db?: any) {
  if (!requireSameOrigin(req, res)) return null

  const user = await getUserFromRequest(req, db)
  if (!user) {
    res.status(401).json({ error: 'authentication required' })
    return null
  }

  if (user.role !== 'admin') {
    res.status(403).json({ error: 'admin role required' })
    return null
  }

  return user
}

export function isReadAuthRequired() {
  return ['1', 'true', 'yes'].includes(String(process.env.REQUIRE_AUTH_FOR_READS || '').toLowerCase())
}

export async function requireReadAccess(req: NextApiRequest, res: NextApiResponse, db?: any) {
  if (!isReadAuthRequired()) return true

  const user = await getUserFromRequest(req, db)
  if (!user) {
    res.status(401).json({ error: 'authentication required' })
    return false
  }

  return true
}

export type RoadmapReadScope = {
  user: AuthUser | null
  allRoadmaps: boolean
  roadmapIds: number[]
}

export async function getRoadmapReadScope(req: NextApiRequest, res: NextApiResponse, db?: any): Promise<RoadmapReadScope | null> {
  const database = db || await openDb()
  const user = await getUserFromRequest(req, database)

  if (!user) {
    if (!isReadAuthRequired()) return { user: null, allRoadmaps: true, roadmapIds: [] }
    res.status(401).json({ error: 'authentication required' })
    return null
  }

  if (user.role === 'admin') return { user, allRoadmaps: true, roadmapIds: [] }

  const settings = await database.get('SELECT can_view_all_roadmaps FROM users WHERE id = ? AND is_active = 1', [user.id])
  if (!settings) {
    res.status(401).json({ error: 'authentication required' })
    return null
  }

  if (Number(settings.can_view_all_roadmaps) !== 0) {
    return { user, allRoadmaps: true, roadmapIds: [] }
  }

  const rows = await database.all(
    'SELECT roadmap_id FROM user_roadmap_access WHERE user_id = ? ORDER BY roadmap_id',
    [user.id]
  )

  return {
    user,
    allRoadmaps: false,
    roadmapIds: rows.map((row: any) => Number(row.roadmap_id)).filter((id: number) => Number.isInteger(id))
  }
}

export function scopeAllowsRoadmap(scope: RoadmapReadScope, roadmapId: unknown) {
  if (scope.allRoadmaps) return true
  const id = Number(Array.isArray(roadmapId) ? roadmapId[0] : roadmapId)
  return Number.isInteger(id) && scope.roadmapIds.includes(id)
}

export function validateSetupToken(candidate: string | undefined) {
  const expected = process.env.AUTH_SETUP_TOKEN
  if (!expected) return process.env.NODE_ENV !== 'production'
  if (!candidate) return false
  return secureCompare(candidate, expected)
}
