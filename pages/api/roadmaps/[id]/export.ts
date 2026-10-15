import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../../lib/http/auth'
import { openDb } from '../../../../lib/persistence'
import { createServices } from '../../../../lib/container'
import { normalizeMetadataKey } from '../../../../lib/domains/content/metadata'
import { parseOrRespond } from '../../../../lib/validation/http'
import { roadmapIdQuerySchema } from '../../../../lib/validation/roadmaps'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }

  const params = parseOrRespond(roadmapIdQuerySchema, req.query, res)
  if (!params) return
  const roadmapId = params.id

  const db = await openDb()
  // Admin-only backup: the document round-trips the quiz answers, so it must
  // never be readable by learners or anonymous readers.
  const admin = await requireAdmin(req, res, db)
  if (!admin) return

  const exportData = await createServices(db).content.exportRoadmap(roadmapId)
  if (!exportData) {
    return res.status(404).json({ error: 'Roadmap no encontrado' })
  }

  const slug = normalizeMetadataKey(exportData.title) || `roadmap-${roadmapId}`
  const filename = `${slug}.json`

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  return res.status(200).json(exportData)
}
