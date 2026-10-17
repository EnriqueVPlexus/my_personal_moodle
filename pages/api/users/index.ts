import type { NextApiRequest, NextApiResponse } from 'next'
import { createServices } from '../../../lib/container'
import { writeAuditLog } from '../../../lib/http/audit'
import { requireAdmin } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { parseOrRespond } from '../../../lib/validation/http'
import { createUserBodySchema } from '../../../lib/validation/users'
import { methodNotAllowed } from '../../../lib/http/methods'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const { admin: adminService } = createServices(db)

  if (req.method === 'GET') {
    if (!(await requireAdmin(req, res, db))) return
    return res.status(200).json(await adminService.listUsers())
  }

  if (req.method === 'POST') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return

    const body = parseOrRespond(createUserBodySchema, req.body, res)
    if (!body) return
    const { email } = body

    const outcome = await adminService.createUser(body)
    if (outcome.status === 'duplicate_email') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo electrónico.' })
    }
    if (outcome.status === 'failed') return res.status(500).json({ error: 'No se pudo crear el usuario.' })

    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'user.create',
      entityType: 'user',
      entityId: outcome.id,
      details: { email, role: outcome.role }
    })
    return res.status(201).json(outcome.user)
  }

  return methodNotAllowed(res, 'GET, POST')
}
