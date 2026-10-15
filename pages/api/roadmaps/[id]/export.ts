import type { NextApiRequest, NextApiResponse } from 'next'
import { getRoadmapReadScope, scopeAllowsRoadmap } from '../../../../lib/auth'
import { openDb } from '../../../../lib/persistence'
import { exportRoadmapAsJson } from '../../../../lib/roadmapImport'
import { normalizeMetadataKey } from '../../../../lib/roadmapMetadata'
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
  const scope = await getRoadmapReadScope(req, res, db)
  if (!scope) return

  if (!scopeAllowsRoadmap(scope, roadmapId)) {
    return res.status(403).json({ error: 'Acceso denegado a este roadmap' })
  }

  const exportData = await exportRoadmapAsJson(db, roadmapId)
  if (!exportData) {
    return res.status(404).json({ error: 'Roadmap no encontrado' })
  }

  const slug = normalizeMetadataKey(exportData.title) || `roadmap-${roadmapId}`
  const filename = `${slug}.json`

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  return res.status(200).json(exportData)
}
