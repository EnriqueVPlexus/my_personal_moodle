import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { requireAdmin } from '../../../lib/auth'
import { openDb } from '../../../lib/db'
import type { DatabaseClient } from '../../../lib/database'
import { hashPassword } from '../../../lib/password'
import { parseOrRespond } from '../../../lib/validation/http'
import { createUserBodySchema } from '../../../lib/validation/users'
import {
  DuplicateEmailError,
  findAllUserRoadmapAccess,
  findAllUsers,
  findUserById,
  insertUser
} from '../../../lib/userRepository'

async function usersWithRoadmapAccess(db: DatabaseClient) {
  const users = await findAllUsers(db)
  const accessRows = await findAllUserRoadmapAccess(db)
  const accessByUser = accessRows.reduce((acc: Record<number, number[]>, row: any) => {
    const userId = Number(row.user_id)
    if (!acc[userId]) acc[userId] = []
    acc[userId].push(Number(row.roadmap_id))
    return acc
  }, {})

  return users.map((user: any) => ({
    ...user,
    can_view_all_roadmaps: user.role === 'admin' ? 1 : Number(user.can_view_all_roadmaps) === 0 ? 0 : 1,
    roadmap_access_ids: accessByUser[Number(user.id)] || []
  }))
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method === 'GET') {
    if (!(await requireAdmin(req, res, db))) return
    return res.status(200).json(await usersWithRoadmapAccess(db))
  }

  if (req.method === 'POST') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return

    const body = parseOrRespond(createUserBodySchema, req.body, res)
    if (!body) return
    const { email, name, password } = body
    const selectedRole = body.role ?? 'user'

    const now = new Date().toISOString()
    try {
      const userId = await insertUser(db, {
        email,
        name: name || null,
        role: selectedRole,
        password_hash: await hashPassword(password),
        created_at: now,
        updated_at: now
      })
      if (!userId) return res.status(500).json({ error: 'No se pudo crear el usuario.' })

      const user = await findUserById(db, userId)
      await writeAuditLog({
        db,
        req,
        user: admin,
        action: 'user.create',
        entityType: 'user',
        entityId: userId,
        details: { email, role: selectedRole }
      })
      return res.status(201).json(user)
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        return res.status(409).json({ error: 'Ya existe un usuario con ese correo electrónico.' })
      }
      throw error
    }
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).end('Method Not Allowed')
}
