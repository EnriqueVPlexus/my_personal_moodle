import type { NextApiRequest, NextApiResponse } from 'next'
import { createSession, requireSameOrigin, validateSetupToken } from '../../../lib/auth'
import { openDb } from '../../../lib/db'
import { hashPassword, normalizeEmail, validatePassword } from '../../../lib/password'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  if (!requireSameOrigin(req, res)) return

  const db = await openDb()
  const row = await db.get('SELECT COUNT(*) AS count FROM users')
  if (Number(row.count) > 0) return res.status(409).json({ error: 'setup already completed' })

  const { email, name, password, setupToken } = req.body || {}
  if (!validateSetupToken(typeof setupToken === 'string' ? setupToken : undefined)) {
    return res.status(403).json({ error: 'setup token required' })
  }

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password required' })
  }

  const validationError = validatePassword(password)
  if (validationError) return res.status(400).json({ error: validationError })

  const now = new Date().toISOString()
  const result = await db.run(
    `INSERT INTO users (email, name, role, password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [
      normalizeEmail(email),
      typeof name === 'string' && name.trim() ? name.trim() : null,
      'admin',
      await hashPassword(password),
      now,
      now
    ]
  )
  const userId = result.lastID
  if (!userId) return res.status(500).json({ error: 'user creation failed' })

  await createSession(res, userId, db)
  return res.status(201).json({ user: { id: userId, email: normalizeEmail(email), name, role: 'admin' } })
}
