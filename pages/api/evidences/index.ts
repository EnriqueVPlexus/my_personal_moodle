import type { NextApiRequest, NextApiResponse } from 'next'
import { withApiErrors } from '../../../lib/http/errors'
import { createServices } from '../../../lib/container'
import { requireAdmin } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { evidenceListQuerySchema } from '../../../lib/validation/evidences'
import { parseOrRespond } from '../../../lib/validation/http'
import { methodNotAllowed } from '../../../lib/http/methods'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method !== 'GET') {
    return methodNotAllowed(res, 'GET')
  }

  if (!(await requireAdmin(req, res, db))) return

  const query = parseOrRespond(evidenceListQuerySchema, req.query, res)
  if (!query) return

  const evidences = await createServices(db).progress.listEvidences({
    userId: query.user_id ?? null,
    moduleId: query.module_id ?? null,
    roadmapId: query.roadmap_id ?? null,
    status: query.status ?? null
  })

  return res.status(200).json(evidences)
}

export default withApiErrors(handler)
