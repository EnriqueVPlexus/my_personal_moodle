import type { NextApiRequest, NextApiResponse } from 'next'
import { withApiErrors } from '../../../lib/http/errors'
import { createServices } from '../../../lib/container'
import { writeAuditLog } from '../../../lib/http/audit'
import { getRoadmapReadScope, requireAdmin } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { parseOrRespond } from '../../../lib/validation/http'
import { createModuleBodySchema, moduleListQuerySchema } from '../../../lib/validation/modules'
import { methodNotAllowed } from '../../../lib/http/methods'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const { content } = createServices(db)

  if (req.method === 'GET') {
    const query = parseOrRespond(moduleListQuerySchema, req.query, res)
    if (!query) return
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return

    return res.status(200).json(await content.listModules(scope, query.roadmap_id))
  }

  if (req.method === 'POST') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const body = parseOrRespond(createModuleBodySchema, req.body, res)
    if (!body) return
    const { title, roadmap_id, level } = body

    const created = await content.createModule(body)
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'module.create',
      entityType: 'module',
      entityId: created.id,
      details: { title, roadmap_id, level }
    })
    return res.status(201).json(created.module)
  }

  methodNotAllowed(res, 'GET, POST')
}

export default withApiErrors(handler)
