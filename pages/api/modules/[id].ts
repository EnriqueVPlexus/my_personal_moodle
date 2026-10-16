import type { NextApiRequest, NextApiResponse } from 'next'
import { createServices } from '../../../lib/container'
import { writeAuditLog } from '../../../lib/http/audit'
import { getRoadmapReadScope, requireAdmin } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { parseOrRespond } from '../../../lib/validation/http'
import { moduleIdQuerySchema, updateModuleBodySchema } from '../../../lib/validation/modules'
import { methodNotAllowed } from '../../../lib/http/methods'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const { content, progress } = createServices(db)

  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'DELETE') {
    return methodNotAllowed(res, 'GET, PUT, DELETE')
  }

  const params = parseOrRespond(moduleIdQuerySchema, req.query, res)
  if (!params) return
  const { id } = params

  if (req.method === 'GET') {
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return

    const detail = await progress.getModuleDetail(scope, id)
    if (!detail) return res.status(404).json({ error: 'No encontrado.' })

    return res.status(200).json(detail)
  }

  if (req.method === 'PUT') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const body = parseOrRespond(updateModuleBodySchema, req.body, res)
    if (!body) return
    const { title, level } = body

    const updated = await content.updateModule(id, body)
    if (!updated) return res.status(404).json({ error: 'Módulo no encontrado.' })

    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'module.update',
      entityType: 'module',
      entityId: String(id),
      details: { title, level: level ?? null }
    })
    return res.status(200).json(updated.module)
  }

  if (req.method === 'DELETE') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return

    const moduleRow = await content.deleteModule(id)
    if (!moduleRow) return res.status(404).json({ error: 'Módulo no encontrado.' })

    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'module.delete',
      entityType: 'module',
      entityId: String(id),
      details: { title: moduleRow?.title || null, roadmap_id: moduleRow?.roadmap_id || null }
    })
    return res.status(204).end()
  }
}
