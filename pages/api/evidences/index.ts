import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { listEvidences } from '../../../lib/evidenceRepository'
import { evidenceListQuerySchema } from '../../../lib/validation/evidences'
import { parseOrRespond } from '../../../lib/validation/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }

  if (!(await requireAdmin(req, res, db))) return

  const query = parseOrRespond(evidenceListQuerySchema, req.query, res)
  if (!query) return

  const evidences = await listEvidences(db, {
    userId: query.user_id ?? null,
    moduleId: query.module_id ?? null,
    roadmapId: query.roadmap_id ?? null,
    status: query.status ?? null
  })

  return res.status(200).json(evidences)
}
