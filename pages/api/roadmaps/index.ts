import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { getRoadmapReadScope, requireAdmin } from '../../../lib/auth'
import { openDb } from '../../../lib/db'
import {
  filterAndRankRoadmaps,
  parseRoadmapSearchQuery,
  ROADMAP_CATALOG_SEARCH_SQL
} from '../../../lib/roadmapSearch'
import { parseRoadmapCatalogFilters } from '../../../lib/roadmapFilters'
import {
  normalizeDurationRange,
  normalizeTopics,
  parseDurationWeeks,
  saveRoadmapMetadata
} from '../../../lib/roadmapMetadata'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method === 'GET') {
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return
    if (!scope.allRoadmaps && scope.roadmapIds.length === 0) return res.status(200).json([])
    const search = parseRoadmapSearchQuery(req.query.q)
    if (search.tooLong) {
      return res.status(400).json({ error: 'search query must be 100 characters or fewer' })
    }
    const rows = await db.all(ROADMAP_CATALOG_SEARCH_SQL)
    const visibleRows = scope.allRoadmaps
      ? rows
      : rows.filter((row: any) => scope.roadmapIds.includes(Number(row.id)))
    const filters = parseRoadmapCatalogFilters(req.query)
    return res.status(200).json(filterAndRankRoadmaps(visibleRows, search, filters))
  }

  if (req.method === 'POST') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const { title, description, duration, category, topics, duration_weeks_min, duration_weeks_max } = req.body
    if (!title) return res.status(400).json({ error: 'title required' })
    const hasManualDuration = duration_weeks_min !== undefined || duration_weeks_max !== undefined
    const durationRange = hasManualDuration
      ? normalizeDurationRange(duration_weeks_min, duration_weeks_max)
      : parseDurationWeeks(duration)
    if (!durationRange) return res.status(400).json({ error: 'invalid duration range' })
    const normalizedTopics = normalizeTopics(topics)
    if (normalizedTopics.length > 20) return res.status(400).json({ error: 'a roadmap can have at most 20 topics' })
    const result = await db.run(
      `INSERT INTO roadmaps (
         title, description, duration, duration_weeks_min, duration_weeks_max
       ) VALUES (?, ?, ?, ?, ?)`,
      [title, description || null, duration || null, durationRange.min, durationRange.max]
    )
    const id = result.lastID
    if (!id) return res.status(500).json({ error: 'roadmap could not be created' })
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
