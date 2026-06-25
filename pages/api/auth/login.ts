import type { NextApiRequest, NextApiResponse } from 'next'
import { createSession, requireSameOrigin } from '../../../lib/auth'
import { rateLimit, clearRateLimit } from '../../../lib/rateLimit'
import { openDb } from '../../../lib/db'
import { normalizeEmail, verifyPassword } from '../../../lib/password'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  // Apply rate limiting to prevent brute force attacks
  if (!rateLimit(req, res, { maxAttempts: 5, windowMs: 60 * 1000 })) return

  if (!requireSameOrigin(req, res)) return

  const { email, password } = req.body || {}
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password required' })
  }

  const db = await openDb()
  const user = await db.get(
    'SELECT id, email, name, role, password_hash FROM users WHERE email = ? AND is_active = 1',
    [normalizeEmail(email)]
  )

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'invalid credentials' })
  }

  // Clear rate limit after successful login
  clearRateLimit(req)
  
  await createSession(res, user.id, db)
  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    }
  })
}
