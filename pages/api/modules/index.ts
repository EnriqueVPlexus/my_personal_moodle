import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/http/audit'
import { getRoadmapReadScope, requireAdmin, scopeAllowsRoadmap } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { findAllModules, findModuleById, findModulesByRoadmapId, findModulesByRoadmapIds, insertModule } from '../../../lib/moduleRepository'
import { parseOrRespond } from '../../../lib/validation/http'
import { createModuleBodySchema, moduleListQuerySchema } from '../../../lib/validation/modules'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method === 'GET') {
    const query = parseOrRespond(moduleListQuerySchema, req.query, res)
    if (!query) return
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return
    const { roadmap_id } = query
    if (roadmap_id) {
      if (!scopeAllowsRoadmap(scope, roadmap_id)) return res.status(200).json([])
      const rows = await findModulesByRoadmapId(db, roadmap_id)
      return res.status(200).json(rows)
    }

    if (!scope.allRoadmaps && scope.roadmapIds.length === 0) return res.status(200).json([])
    if (!scope.allRoadmaps) {
      const rows = await findModulesByRoadmapIds(db, scope.roadmapIds)
      return res.status(200).json(rows)
    }

    const rows = await findAllModules(db)
    return res.status(200).json(rows)
  }

  if (req.method === 'POST') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const body = parseOrRespond(createModuleBodySchema, req.body, res)
    if (!body) return
    const { title, roadmap_id, duration } = body
    const normalizedLevel = body.level
    const durationRange = body.durationWeeks
    const newId = await insertModule(db, {
      roadmap_id,
      title,
      level: normalizedLevel,
      duration: duration || null,
      duration_weeks_min: durationRange.min,
      duration_weeks_max: durationRange.max
    })
    const row = await findModuleById(db, newId)
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'module.create',
      entityType: 'module',
      entityId: newId,
      details: { title, roadmap_id, level: normalizedLevel }
    })
    return res.status(201).json(row)
  }

  res.setHeader('Allow', 'GET, POST')
  res.status(405).end('Method Not Allowed')
}
