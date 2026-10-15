import type { NextApiRequest, NextApiResponse } from 'next'
import { createServices } from '../../../lib/container'
import { writeAuditLog } from '../../../lib/http/audit'
import { requireAdmin } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import type { UserRuleViolation } from '../../../lib/domains/admin'
import { parseOrRespond } from '../../../lib/validation/http'
import { updateUserBodySchema, userIdQuerySchema } from '../../../lib/validation/users'

const VIOLATION_MESSAGES: Record<UserRuleViolation, string> = {
  cannot_deactivate_self: 'No puedes desactivar tu propia cuenta.',
  last_active_admin: 'No se puede desactivar al último administrador activo.',
  admin_has_full_access: 'Los administradores siempre tienen acceso a todos los roadmaps.',
  unknown_roadmaps: 'Algún roadmap indicado no existe.'
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

  const outcome = await createServices(db).admin.updateUser(admin, userId, body)

  if (outcome.status === 'not_found') return res.status(404).json({ error: 'Usuario no encontrado.' })

  if (outcome.status === 'rejected') {
    const error = VIOLATION_MESSAGES[outcome.violation]
    if (outcome.violation === 'unknown_roadmaps') {
      return res.status(400).json({ error, issues: [{ path: 'roadmap_ids', message: error }] })
    }
    return res.status(400).json({ error })
  }

  await writeAuditLog({
    db,
    req,
    user: admin,
    action: outcome.audit.action,
    entityType: 'user',
    entityId: userId,
    details: outcome.audit.details
  })

  return res.status(200).json(outcome.user)
}
