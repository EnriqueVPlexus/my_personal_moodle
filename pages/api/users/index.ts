import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { isValidRole, requireAdmin } from '../../../lib/auth'
import { openDb } from '../../../lib/db'
import type { DatabaseClient } from '../../../lib/database'
import { hashPassword, normalizeEmail, validatePassword } from '../../../lib/password'
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

    const { email, name, role, password } = req.body || {}
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'email and password required' })
    }

    const selectedRole = isValidRole(role) ? role : 'user'
    const validationError = validatePassword(password)
    if (validationError) return res.status(400).json({ error: validationError })

    const now = new Date().toISOString()
    try {
      const userId = await insertUser(db, {
        email: normalizeEmail(email),
        name: typeof name === 'string' && name.trim() ? name.trim() : null,
        role: selectedRole,
        password_hash: await hashPassword(password),
        created_at: now,
        updated_at: now
      })
      if (!userId) return res.status(500).json({ error: 'user creation failed' })

      const user = await findUserById(db, userId)
      await writeAuditLog({
        db,
        req,
        user: admin,
        action: 'user.create',
        entityType: 'user',
        entityId: userId,
        details: { email: normalizeEmail(email), role: selectedRole }
      })
      return res.status(201).json(user)
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        return res.status(409).json({ error: 'email already exists' })
      }
      throw error
    }
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).end('Method Not Allowed')
}
