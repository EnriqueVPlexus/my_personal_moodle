import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { getRoadmapReadScope, requireAdmin } from '../../../lib/auth'
import { openDb } from '../../../lib/db'
import {
  filterAndRankRoadmaps,
  parseRoadmapSearchQuery,
  POSTGRES_ROADMAP_CATALOG_SEARCH_SQL,
  ROADMAP_CATALOG_SEARCH_SQL
} from '../../../lib/roadmapSearch'
import { parseRoadmapCatalogFilters } from '../../../lib/roadmapFilters'
import { listUserRoadmapProgress } from '../../../lib/progressRepository'
import { saveRoadmapMetadata } from '../../../lib/roadmapMetadata'
import { roadmapCatalogQuerySchema } from '../../../lib/validation/catalog'
import { parseOrRespond } from '../../../lib/validation/http'
import { createRoadmapBodySchema } from '../../../lib/validation/roadmaps'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method === 'GET') {
    if (!parseOrRespond(roadmapCatalogQuerySchema, req.query, res)) return
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return
    if (!scope.allRoadmaps && scope.roadmapIds.length === 0) return res.status(200).json([])
    const search = parseRoadmapSearchQuery(req.query.q)
    const rows = await db.all(
      process.env.DATABASE_URL ? POSTGRES_ROADMAP_CATALOG_SEARCH_SQL : ROADMAP_CATALOG_SEARCH_SQL
    )
    const visibleRows = scope.allRoadmaps
      ? rows
      : rows.filter((row: any) => scope.roadmapIds.includes(Number(row.id)))

    if (scope.user) {
      const userProgress = await listUserRoadmapProgress(db, scope.user.id)
      const progressMap = new Map<number, string>()
      userProgress.forEach(p => {
        progressMap.set(p.roadmap_id, p.status === 'completed' ? 'completed' : 'in_progress')
      })
      visibleRows.forEach((row: any) => {
        row.user_progress_status = progressMap.get(Number(row.id)) || 'not_started'
      })
    }

    const filters = parseRoadmapCatalogFilters(req.query)
    return res.status(200).json(filterAndRankRoadmaps(visibleRows, search, filters))
  }

  if (req.method === 'POST') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const body = parseOrRespond(createRoadmapBodySchema, req.body, res)
    if (!body) return
    const { title, description, duration, category, version, publishedAt } = body
    const durationRange = body.durationWeeks
    const normalizedTopics = body.topics ?? []
    const result = await db.run(
      `INSERT INTO roadmaps (
         title, description, duration, duration_weeks_min, duration_weeks_max, version, published_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title, description || null, duration || null, durationRange.min, durationRange.max, version, publishedAt]
    )
    const id = result.lastID
    if (!id) return res.status(500).json({ error: 'No se pudo crear el roadmap.' })
    await saveRoadmapMetadata(db, id, category, normalizedTopics)
    const row = await db.get('SELECT * FROM roadmaps WHERE id = ?', [id])
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'roadmap.create',
      entityType: 'roadmap',
      entityId: id,
      details: { title, category: category || null, topics: normalizedTopics }
    })
    return res.status(201).json(row)
  }

  res.setHeader('Allow', 'GET, POST')
  res.status(405).end('Method Not Allowed')
}
