import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { requireAdmin } from '../../../lib/auth'
import { openDb } from '../../../lib/db'
import { hashPassword, validatePassword } from '../../../lib/password'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const { id } = req.query

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH')
    return res.status(405).end('Method Not Allowed')
  }

  const admin = await requireAdmin(req, res, db)
  if (!admin) return

  const userId = Number(Array.isArray(id) ? id[0] : id)
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'invalid user id' })

  const target = await db.get('SELECT id, email, role, is_active FROM users WHERE id = ?', [userId])
  if (!target) return res.status(404).json({ error: 'user not found' })

  const { action } = req.body || {}

  if (action === 'set_active') {
    const isActive = Boolean(req.body.is_active)

    if (!isActive && userId === admin.id) {
      return res.status(400).json({ error: 'you cannot deactivate your own account' })
    }

    if (!isActive && target.role === 'admin') {
      const row = await db.get(
        'SELECT COUNT(*) AS count FROM users WHERE role = ? AND is_active = 1 AND id != ?',
        ['admin', userId]
      )
      if (Number(row.count) === 0) {
        return res.status(400).json({ error: 'cannot deactivate the last active admin' })
      }
    }

    await db.run('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?', [isActive ? 1 : 0, new Date().toISOString(), userId])
    if (!isActive) await db.run('DELETE FROM sessions WHERE user_id = ?', [userId])

    const updated = await db.get(
      'SELECT id, email, name, role, is_active, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    )

    await writeAuditLog({
      db,
      req,
      user: admin,
      action: isActive ? 'user.activate' : 'user.deactivate',
      entityType: 'user',
      entityId: userId,
      details: { email: target.email }
    })

    return res.status(200).json(updated)
  }

  if (action === 'reset_password') {
    const { password } = req.body || {}
    if (typeof password !== 'string') return res.status(400).json({ error: 'password required' })

    const validationError = validatePassword(password)
    if (validationError) return res.status(400).json({ error: validationError })

    await db.run(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      [await hashPassword(password), new Date().toISOString(), userId]
    )
    await db.run('DELETE FROM sessions WHERE user_id = ?', [userId])

    const updated = await db.get(
      'SELECT id, email, name, role, is_active, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    )

    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'user.reset_password',
      entityType: 'user',
      entityId: userId,
      details: { email: target.email }
    })

    return res.status(200).json(updated)
  }

  return res.status(400).json({ error: 'unsupported action' })
}
