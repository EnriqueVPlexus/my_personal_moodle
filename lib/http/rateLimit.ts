import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthService } from '../domains/auth'
import type { DatabaseClient } from '../persistence'

/**
 * HTTP adapter for the rate limiter. The bucket state and the counting rule
 * live in the auth service; this module derives the key from the request and
 * writes the 429 response.
 */

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim()
  }
  return req.socket.remoteAddress || 'unknown'
}

/**
 * Rate limit middleware for login and setup endpoints.
 * @param scope distinguishes independent buckets (e.g. "login", "setup") so
 *   attempts on one endpoint don't consume the limit of another.
 * @returns true if request is allowed, false if rate limited (response already sent)
 */
export async function rateLimit(
  db: DatabaseClient,
  req: NextApiRequest,
  res: NextApiResponse,
  options: {
    maxAttempts?: number
    windowMs?: number
    scope?: string
  } = {}
): Promise<boolean> {
  // Disable rate limiting in test environment
  if (process.env.NODE_ENV === 'test') return true

  const { maxAttempts = 5, windowMs = 60 * 1000, scope = 'default' } = options
  const { allowed } = await createAuthService(db).registerAttempt(
    `${scope}:${getClientIp(req)}`,
    { maxAttempts, windowMs }
  )

  if (!allowed) {
    res.status(429).json({ error: 'Demasiados intentos. Inténtalo de nuevo más tarde.' })
    return false
  }

  return true
}

/**
 * Clear rate limit entry for an IP within a scope (call after successful authentication).
 */
export async function clearRateLimit(db: DatabaseClient, req: NextApiRequest, scope = 'default') {
  await createAuthService(db).clearAttempts(`${scope}:${getClientIp(req)}`)
}
