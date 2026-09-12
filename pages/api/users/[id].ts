import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { requireAdmin } from '../../../lib/auth'
import { openDb } from '../../../lib/db'
import { hashPassword, validatePassword } from '../../../lib/password'

function normalizeRoadmapIds(value: unknown) {
  if (!Array.isArray(value)) return []
  const ids = value.map(item => Number(item))
  if (!ids.every(id => Number.isInteger(id) && id > 0)) return null
  return Array.from(new Set(ids))
}

async function userWithRoadmapAccess(db: any, userId: number) {
  const user = await db.get(
    'SELECT id, email, name, role, is_active, can_view_all_roadmaps, created_at, updated_at FROM users WHERE id = ?',
    [userId]
  )
  if (!user) return null

  const accessRows = await db.all(
    'SELECT roadmap_id FROM user_roadmap_access WHERE user_id = ? ORDER BY roadmap_id',
    [userId]
  )

  return {
    ...user,
    can_view_all_roadmaps: user.role === 'admin' ? 1 : Number(user.can_view_all_roadmaps) === 0 ? 0 : 1,
    roadmap_access_ids: accessRows.map((row: any) => Number(row.roadmap_id))
  }
}

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

    // Double-check before update to prevent race condition where last admin gets deactivated
    if (!isActive && target.role === 'admin') {
      const adminCountCheck = await db.get(
        'SELECT COUNT(*) AS count FROM users WHERE role = ? AND is_active = 1 AND id != ?',
        ['admin', userId]
      )
      if (Number(adminCountCheck.count) === 0) {
        return res.status(400).json({ error: 'cannot deactivate the last active admin' })
      }
    }

    const result = await db.run('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?', [isActive ? 1 : 0, new Date().toISOString(), userId])
    if (!result.changes) return res.status(404).json({ error: 'user not found' })
    
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

    const result = await db.run(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      [await hashPassword(password), new Date().toISOString(), userId]
    )
    if (!result.changes) return res.status(404).json({ error: 'user not found' })
    
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

  if (action === 'set_roadmap_access') {
    if (target.role === 'admin') {
      return res.status(400).json({ error: 'admin users always have access to every roadmap' })
    }

    const canViewAllRoadmaps = Boolean(req.body.can_view_all_roadmaps)
    const roadmapIds = canViewAllRoadmaps ? [] : normalizeRoadmapIds(req.body.roadmap_ids)
    if (!roadmapIds) return res.status(400).json({ error: 'invalid roadmap ids' })

    if (roadmapIds.length > 0) {
      const existingRows = await db.all(
        `SELECT id FROM roadmaps WHERE id IN (${roadmapIds.map(() => '?').join(', ')})`,
        roadmapIds
      )
      if (existingRows.length !== roadmapIds.length) {
        return res.status(400).json({ error: 'invalid roadmap ids' })
      }
    }

    const now = new Date().toISOString()
    await db.run(
      'UPDATE users SET can_view_all_roadmaps = ?, updated_at = ? WHERE id = ?',
      [canViewAllRoadmaps ? 1 : 0, now, userId]
    )
    await db.run('DELETE FROM user_roadmap_access WHERE user_id = ?', [userId])

    for (const roadmapId of roadmapIds) {
      await db.run(
        'INSERT OR IGNORE INTO user_roadmap_access (user_id, roadmap_id, created_at) VALUES (?, ?, ?)',
        [userId, roadmapId, now]
      )
    }

    const updated = await userWithRoadmapAccess(db, userId)
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'user.update_roadmap_access',
      entityType: 'user',
      entityId: userId,
      details: {
        email: target.email,
        can_view_all_roadmaps: canViewAllRoadmaps,
        roadmap_ids: roadmapIds
      }
    })

    return res.status(200).json(updated)
  }

  return res.status(400).json({ error: 'unsupported action' })
}
