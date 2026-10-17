import type { NextApiRequest, NextApiResponse } from 'next'
import { withApiErrors } from '../../../lib/http/errors'
import { createServices } from '../../../lib/container'
import { writeAuditLog } from '../../../lib/http/audit'
import { getRoadmapReadScope, requireAdmin } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { parseOrRespond } from '../../../lib/validation/http'
import { roadmapIdQuerySchema, updateRoadmapBodySchema } from '../../../lib/validation/roadmaps'
import { methodNotAllowed } from '../../../lib/http/methods'

const ROADMAP_ALREADY_GONE_MESSAGE = 'El roadmap no existía; no había nada que borrar.'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const { content, progress } = createServices(db)

  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'DELETE') {
    return methodNotAllowed(res, 'GET, PUT, DELETE')
  }

  const params = parseOrRespond(roadmapIdQuerySchema, req.query, res)
  if (!params) return
  const { id } = params

  if (req.method === 'GET') {
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return

    const detail = await progress.getRoadmapDetail(scope, id)
    if (!detail) return res.status(404).json({ error: 'No encontrado.' })

    return res.status(200).json(detail)
  }

  if (req.method === 'PUT') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const body = parseOrRespond(updateRoadmapBodySchema, req.body, res)
    if (!body) return
    const { title, category } = body

    const updated = await content.updateRoadmap(id, body)
    if (!updated) return res.status(404).json({ error: 'Roadmap no encontrado.' })

    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'roadmap.update',
      entityType: 'roadmap',
      entityId: String(id),
      details: { title, category: category || null, topics: updated.topics }
    })
    return res.status(200).json(updated.roadmap)
  }

  if (req.method === 'DELETE') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return

    const { deleted, title } = await content.deleteRoadmap(id)
    // Idempotent: a roadmap that did not exist answers 200 with a message and
    // leaves no audit entry, because nothing was deleted.
    if (!deleted) return res.status(200).json({ message: ROADMAP_ALREADY_GONE_MESSAGE })

    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'roadmap.delete',
      entityType: 'roadmap',
      entityId: String(id),
      details: { title }
    })
    return res.status(204).end()
  }
}

export default withApiErrors(handler)
