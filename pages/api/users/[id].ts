import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/http/audit'
import { requireAdmin } from '../../../lib/auth'
import { openDb } from '../../../lib/persistence'
import type { DatabaseClient } from '../../../lib/persistence/database'
import { hashPassword } from '../../../lib/password'
import { parseOrRespond } from '../../../lib/validation/http'
import { updateUserBodySchema, userIdQuerySchema } from '../../../lib/validation/users'
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

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH')
    return res.status(405).end('Method Not Allowed')
  }

  const admin = await requireAdmin(req, res, db)
  if (!admin) return

  const params = parseOrRespond(userIdQuerySchema, req.query, res)
  if (!params) return
  const userId = params.id

  const body = parseOrRespond(updateUserBodySchema, req.body, res)
  if (!body) return

  const target = await findUserById(db, userId)
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado.' })

  if (body.action === 'set_active') {
    const isActive = body.is_active

    if (!isActive && userId === admin.id) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' })
    }

    if (!isActive && target.role === 'admin') {
      const count = await countActiveAdmins(db, userId)
      if (count === 0) {
        return res.status(400).json({ error: 'No se puede desactivar al último administrador activo.' })
      }
    }

    // Double-check before update to prevent race condition where last admin gets deactivated
    if (!isActive && target.role === 'admin') {
      const count = await countActiveAdmins(db, userId)
      if (count === 0) {
        return res.status(400).json({ error: 'No se puede desactivar al último administrador activo.' })
      }
    }

    const changes = await updateUserActive(db, userId, isActive, new Date().toISOString())
    if (!changes) return res.status(404).json({ error: 'Usuario no encontrado.' })

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

  if (body.action === 'reset_password') {
    const changes = await updateUserPassword(db, userId, await hashPassword(body.password), new Date().toISOString())
    if (!changes) return res.status(404).json({ error: 'Usuario no encontrado.' })

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

  if (body.action === 'set_roadmap_access') {
    if (target.role === 'admin') {
      return res.status(400).json({ error: 'Los administradores siempre tienen acceso a todos los roadmaps.' })
    }

    const canViewAllRoadmaps = body.can_view_all_roadmaps
    const roadmapIds = canViewAllRoadmaps ? [] : body.roadmap_ids ?? []

    if (roadmapIds.length > 0) {
      const existingIds = await findExistingRoadmapIds(db, roadmapIds)
      if (existingIds.length !== roadmapIds.length) {
        return res.status(400).json({
          error: 'Algún roadmap indicado no existe.',
          issues: [{ path: 'roadmap_ids', message: 'Algún roadmap indicado no existe.' }]
        })
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
}
