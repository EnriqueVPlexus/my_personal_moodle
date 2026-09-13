import type { NextApiRequest, NextApiResponse } from 'next'
import type { DatabaseClient } from './database'

/**
 * Rate limiter backed by the shared database (SQLite locally, PostgreSQL in
 * production). Storing state in the database instead of process memory keeps
 * the limit effective across multiple server instances/serverless invocations,
 * which an in-memory store cannot do.
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
  const key = `${scope}:${getClientIp(req)}`
  const now = Date.now()

  const existing = await db.get<{ attempt_count: number; reset_at: string }>(
    'SELECT attempt_count, reset_at FROM rate_limits WHERE rate_key = ?',
    [key]
  )

  const isExpired = !existing || new Date(existing.reset_at).getTime() <= now
  const nextCount = isExpired ? 1 : Number(existing.attempt_count) + 1
  const nextResetAt = isExpired ? new Date(now + windowMs).toISOString() : existing.reset_at

  if (existing) {
    await db.run('UPDATE rate_limits SET attempt_count = ?, reset_at = ? WHERE rate_key = ?', [
      nextCount,
      nextResetAt,
      key
    ])
  } else {
    await db.run('INSERT INTO rate_limits (rate_key, attempt_count, reset_at) VALUES (?, ?, ?)', [
      key,
      nextCount,
      nextResetAt
    ])
  }

  if (nextCount > maxAttempts) {
    res.status(429).json({ error: 'too many attempts, please try again later' })
    return false
  }

  return true
}

/**
 * Clear rate limit entry for an IP within a scope (call after successful authentication).
 */
export async function clearRateLimit(db: DatabaseClient, req: NextApiRequest, scope = 'default') {
  await db.run('DELETE FROM rate_limits WHERE rate_key = ?', [`${scope}:${getClientIp(req)}`])
}
