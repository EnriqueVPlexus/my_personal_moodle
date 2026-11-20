import type { NextApiRequest, NextApiResponse } from 'next'
import { withApiErrors } from '../../../lib/http/errors'
import { createServices } from '../../../lib/container'
import { getRoadmapReadScope } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { parseRoadmapSearchQuery } from '../../../lib/domains/content/search'
import { parseRoadmapCatalogFilters } from '../../../lib/domains/content/filters'
import { roadmapCatalogQuerySchema } from '../../../lib/validation/catalog'
import { parseOrRespond } from '../../../lib/validation/http'
import { methodNotAllowed } from '../../../lib/http/methods'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method !== 'GET') {
    return methodNotAllowed(res, 'GET')
  }
  if (!parseOrRespond(roadmapCatalogQuerySchema, req.query, res)) return
  const scope = await getRoadmapReadScope(req, res, db)
  if (!scope) return

  const search = parseRoadmapSearchQuery(req.query.q)
  const filters = parseRoadmapCatalogFilters(req.query)
  return res.status(200).json(await createServices(db).content.getCatalogMetadata(scope, search, filters))
}

export default withApiErrors(handler)
