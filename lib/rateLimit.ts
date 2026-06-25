import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * Simple in-memory rate limiter for protecting sensitive endpoints
 * Tracks attempts per IP address
 */

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

const store: RateLimitStore = {}

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim()
  }
  return req.socket.remoteAddress || 'unknown'
}

/**
 * Rate limit middleware for login and setup endpoints
 * @param req NextApiRequest
 * @param res NextApiResponse
 * @param options Configuration for rate limiting
 * @returns true if request is allowed, false if rate limited
 */
export function rateLimit(
  req: NextApiRequest,
  res: NextApiResponse,
  options: {
    maxAttempts?: number
    windowMs?: number
  } = {}
) {
  // Disable rate limiting in test environment
  if (process.env.NODE_ENV === 'test') return true

  const { maxAttempts = 5, windowMs = 60 * 1000 } = options // 5 attempts per 60 seconds
  const ip = getClientIp(req)
  const now = Date.now()

  // Clean up old entries
  if (!store[ip]) {
    store[ip] = { count: 0, resetTime: now + windowMs }
  }

  const entry = store[ip]

  // Reset if window has passed
  if (now > entry.resetTime) {
    entry.count = 0
    entry.resetTime = now + windowMs
  }

  entry.count++

  if (entry.count > maxAttempts) {
    res.status(429).json({ error: 'too many attempts, please try again later' })
    return false
  }

  return true
}

/**
 * Clear rate limit entry for an IP (call after successful authentication)
 */
export function clearRateLimit(req: NextApiRequest) {
  const ip = getClientIp(req)
  delete store[ip]
}
