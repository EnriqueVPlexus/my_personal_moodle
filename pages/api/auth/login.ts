import type { NextApiRequest, NextApiResponse } from 'next'
import { createSession, requireSameOrigin } from '../../../lib/http/auth'
import { rateLimit, clearRateLimit } from '../../../lib/http/rateLimit'
import { openDb } from '../../../lib/persistence'
import { createAuthService } from '../../../lib/domains/auth'
import { loginBodySchema } from '../../../lib/validation/auth'
import { parseOrRespond } from '../../../lib/validation/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  const db = await openDb()

  // Apply rate limiting to prevent brute force attacks
  if (!(await rateLimit(db, req, res, { maxAttempts: 5, windowMs: 60 * 1000, scope: 'login' }))) return

  if (!requireSameOrigin(req, res)) return

  const body = parseOrRespond(loginBodySchema, req.body, res)
  if (!body) return
  const { email, password } = body

  const result = await createAuthService(db).login(email, password)
  if (!result.ok) {
    return res.status(401).json({ error: 'invalid credentials' })
  }

  // Clear rate limit after successful login
  await clearRateLimit(db, req, 'login')

  await createSession(res, result.user.id, db)
  return res.status(200).json({ user: result.user })
}
