import type { NextApiRequest, NextApiResponse } from 'next'
import {
  createAuthService,
  isReadAuthRequired,
  isSetupTokenValid,
  isValidRole,
  scopeAllowsRoadmap,
  type AuthFailure,
  type AuthResult,
  type AuthRole,
  type AuthUser,
  type RoadmapReadScope
} from '../domains/auth'
import type { DatabaseClient } from '../persistence'
import { openDb } from '../persistence'
import { getHeaderValue } from './headers'

export type { AuthRole, AuthUser, RoadmapReadScope }
export { isReadAuthRequired, isValidRole, scopeAllowsRoadmap }

/**
 * HTTP adapter for the auth domain: reads the session cookie and Origin
 * header from the request and maps domain failures to the 401/403 responses.
 */

const SESSION_COOKIE = 'moodle_session'

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

function sessionToken(req: NextApiRequest): string | undefined {
  return parseCookies(req)[SESSION_COOKIE]
}

const FAILURE_RESPONSES: Record<AuthFailure, { status: number; error: string }> = {
  unauthenticated: { status: 401, error: 'authentication required' },
  forbidden: { status: 403, error: 'admin role required' }
}

function respondFailure(res: NextApiResponse, reason: AuthFailure) {
  const { status, error } = FAILURE_RESPONSES[reason]
  res.status(status).json({ error })
}

/** Unwraps a domain result or writes the matching 401/403 and returns null. */
function unwrapOrRespond<T>(result: AuthResult<T>, res: NextApiResponse): T | null {
  if (result.ok) return result.value
  respondFailure(res, result.reason)
  return null
}

export async function createSession(res: NextApiResponse, userId: number, db?: DatabaseClient) {
  const auth = createAuthService(db || await openDb())
  const { token, maxAgeSeconds } = await auth.startSession(userId)
  res.setHeader('Set-Cookie', sessionCookie(token, maxAgeSeconds))
}

export async function clearSession(req: NextApiRequest, res: NextApiResponse, db?: DatabaseClient) {
  const auth = createAuthService(db || await openDb())
  await auth.endSession(sessionToken(req))
  res.setHeader('Set-Cookie', sessionCookie('', 0))
}

export async function getUserFromRequest(req: NextApiRequest, db?: DatabaseClient): Promise<AuthUser | null> {
  const token = sessionToken(req)
  if (!token) return null

  return createAuthService(db || await openDb()).authenticate(token)
}

function getAllowedOriginHosts(): string[] | null {
  const raw = process.env.ALLOWED_ORIGIN
  if (!raw) return null
  const hosts = raw.split(',').map(value => value.trim()).filter(Boolean)
  return hosts.length ? hosts : null
}

export function requireSameOrigin(req: NextApiRequest, res: NextApiResponse) {
  const method = req.method || 'GET'
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return true

  const origin = getHeaderValue(req.headers.origin)
  if (!origin) return true

  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    res.status(403).json({ error: 'invalid origin' })
    return false
  }

  // When ALLOWED_ORIGIN is configured, trust it over request headers: behind
  // a proxy/CDN, x-forwarded-host/host can be attacker-controlled if the
  // proxy doesn't overwrite them before reaching this process.
  const allowedHosts = getAllowedOriginHosts()
  if (allowedHosts) {
    if (allowedHosts.includes(originHost)) return true
    res.status(403).json({ error: 'origin not allowed' })
    return false
  }

  const forwardedHost = getHeaderValue(req.headers['x-forwarded-host'])
  const host = forwardedHost || getHeaderValue(req.headers.host)
  if (!host) {
    res.status(403).json({ error: 'origin check failed' })
    return false
  }

  if (originHost === host) return true

  res.status(403).json({ error: 'origin not allowed' })
  return false
}

async function requireRole(req: NextApiRequest, res: NextApiResponse, role: AuthRole, db?: DatabaseClient) {
  if (!requireSameOrigin(req, res)) return null

  const token = sessionToken(req)
  if (!token) {
    respondFailure(res, 'unauthenticated')
    return null
  }

  const auth = createAuthService(db || await openDb())
  return unwrapOrRespond(await auth.authorize(token, role), res)
}

export function requireAdmin(req: NextApiRequest, res: NextApiResponse, db?: DatabaseClient) {
  return requireRole(req, res, 'admin', db)
}

export function requireUser(req: NextApiRequest, res: NextApiResponse, db?: DatabaseClient) {
  return requireRole(req, res, 'user', db)
}

export async function requireReadAccess(req: NextApiRequest, res: NextApiResponse, db?: DatabaseClient) {
  if (!isReadAuthRequired()) return true

  const token = sessionToken(req)
  if (!token) {
    respondFailure(res, 'unauthenticated')
    return false
  }

  const auth = createAuthService(db || await openDb())
  return unwrapOrRespond(await auth.authorizeRead(token), res) !== null
}

export async function getRoadmapReadScope(
  req: NextApiRequest,
  res: NextApiResponse,
  db?: DatabaseClient
): Promise<RoadmapReadScope | null> {
  const auth = createAuthService(db || await openDb())
  return unwrapOrRespond(await auth.resolveReadScope(sessionToken(req)), res)
}

export function validateSetupToken(candidate: string | undefined) {
  return isSetupTokenValid(candidate, process.env.AUTH_SETUP_TOKEN, process.env.NODE_ENV === 'production')
}
