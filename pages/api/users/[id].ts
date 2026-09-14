import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { requireAdmin } from '../../../lib/auth'
import { openDb } from '../../../lib/db'
import type { DatabaseClient } from '../../../lib/database'
import { hashPassword, validatePassword } from '../../../lib/password'
import { findExistingRoadmapIds } from '../../../lib/roadmapRepository'
import {
  countActiveAdmins,
  deleteSessionsByUserId,
  deleteUserRoadmapAccess,
  findUserById,
  findUserRoadmapAccessIds,
  insertUserRoadmapAccessMany,
  updateUserActive,
  updateUserPassword,
  updateUserRoadmapAccessFlag
} from '../../../lib/userRepository'

function normalizeRoadmapIds(value: unknown) {
  if (!Array.isArray(value)) return []
  const ids = value.map(item => Number(item))
  if (!ids.every(id => Number.isInteger(id) && id > 0)) return null
  return Array.from(new Set(ids))
}

async function userWithRoadmapAccess(db: DatabaseClient, userId: number) {
  const user = await findUserById(db, userId)
  if (!user) return null

  const roadmapAccessIds = await findUserRoadmapAccessIds(db, userId)

  return {
    ...user,
    can_view_all_roadmaps: user.role === 'admin' ? 1 : Number(user.can_view_all_roadmaps) === 0 ? 0 : 1,
    roadmap_access_ids: roadmapAccessIds
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

  const target = await findUserById(db, userId)
  if (!target) return res.status(404).json({ error: 'user not found' })

  const { action } = req.body || {}

  if (action === 'set_active') {
    const isActive = Boolean(req.body.is_active)

    if (!isActive && userId === admin.id) {
      return res.status(400).json({ error: 'you cannot deactivate your own account' })
    }

    if (!isActive && target.role === 'admin') {
      const count = await countActiveAdmins(db, userId)
      if (count === 0) {
        return res.status(400).json({ error: 'cannot deactivate the last active admin' })
      }
    }

    // Double-check before update to prevent race condition where last admin gets deactivated
    if (!isActive && target.role === 'admin') {
      const count = await countActiveAdmins(db, userId)
      if (count === 0) {
        return res.status(400).json({ error: 'cannot deactivate the last active admin' })
      }
    }

    const changes = await updateUserActive(db, userId, isActive, new Date().toISOString())
    if (!changes) return res.status(404).json({ error: 'user not found' })

    if (!isActive) await deleteSessionsByUserId(db, userId)

    const updated = await findUserById(db, userId)

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

    const changes = await updateUserPassword(db, userId, await hashPassword(password), new Date().toISOString())
    if (!changes) return res.status(404).json({ error: 'user not found' })

    await deleteSessionsByUserId(db, userId)

    const updated = await findUserById(db, userId)

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
      const existingIds = await findExistingRoadmapIds(db, roadmapIds)
      if (existingIds.length !== roadmapIds.length) {
        return res.status(400).json({ error: 'invalid roadmap ids' })
      }
    }

    const now = new Date().toISOString()
    await updateUserRoadmapAccessFlag(db, userId, canViewAllRoadmaps, now)
    await deleteUserRoadmapAccess(db, userId)
    await insertUserRoadmapAccessMany(db, userId, roadmapIds, now)

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
