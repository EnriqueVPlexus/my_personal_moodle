import type { NextApiRequest, NextApiResponse } from 'next'
import { withApiErrors } from '../../../lib/http/errors'
import { createServices } from '../../../lib/container'
import { writeAuditLog } from '../../../lib/http/audit'
import { getRoadmapReadScope, requireAdmin } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { parseRoadmapSearchQuery } from '../../../lib/domains/content/search'
import { parseRoadmapCatalogFilters } from '../../../lib/domains/content/filters'
import { roadmapCatalogQuerySchema } from '../../../lib/validation/catalog'
import { parseOrRespond } from '../../../lib/validation/http'
import { createRoadmapBodySchema } from '../../../lib/validation/roadmaps'
import { methodNotAllowed } from '../../../lib/http/methods'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const { content } = createServices(db)

  if (req.method === 'GET') {
    if (!parseOrRespond(roadmapCatalogQuerySchema, req.query, res)) return
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return

    const search = parseRoadmapSearchQuery(req.query.q)
    const filters = parseRoadmapCatalogFilters(req.query)
    return res.status(200).json(await content.searchCatalog(scope, search, filters))
  }

  if (req.method === 'POST') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const body = parseOrRespond(createRoadmapBodySchema, req.body, res)
    if (!body) return
    const { title, category } = body

    const created = await content.createRoadmap(body)
    if (!created) return res.status(500).json({ error: 'No se pudo crear el roadmap.' })

    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'roadmap.create',
      entityType: 'roadmap',
      entityId: created.id,
      details: { title, category: category || null, topics: created.topics }
    })
    return res.status(201).json(created.roadmap)
  }

  methodNotAllowed(res, 'GET, POST')
}

export default withApiErrors(handler)
