import type { NextApiRequest, NextApiResponse } from 'next'
import { getRoadmapReadScope, scopeAllowsRoadmap } from '../../../../lib/auth'
import { openDb } from '../../../../lib/db'
import { exportRoadmapAsJson } from '../../../../lib/roadmapImport'
import { normalizeMetadataKey } from '../../../../lib/roadmapMetadata'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }

  const db = await openDb()
  const scope = await getRoadmapReadScope(req, res, db)
  if (!scope) return

  const { id } = req.query
  const roadmapId = Number(id)
  if (!Number.isInteger(roadmapId) || roadmapId <= 0) {
    return res.status(400).json({ error: 'ID de roadmap no válido' })
  }

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
