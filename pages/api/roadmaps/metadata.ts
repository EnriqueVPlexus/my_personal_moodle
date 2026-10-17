import type { NextApiRequest, NextApiResponse } from 'next'
import { withApiErrors } from '../../../lib/http/errors'
import { createServices } from '../../../lib/container'
import { getRoadmapReadScope } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { methodNotAllowed } from '../../../lib/http/methods'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method !== 'GET') {
    return methodNotAllowed(res, 'GET')
  }
  const scope = await getRoadmapReadScope(req, res, db)
  if (!scope) return

  return res.status(200).json(await createServices(db).content.getCatalogMetadata(scope))
}

export default withApiErrors(handler)
