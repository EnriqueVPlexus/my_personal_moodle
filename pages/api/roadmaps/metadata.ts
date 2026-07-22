import type { NextApiRequest, NextApiResponse } from 'next'
import { requireReadAccess } from '../../../lib/auth'
import { openDb } from '../../../lib/db'
import { MODULE_LEVELS } from '../../../lib/roadmapMetadata'
import { ROADMAP_DURATION_FILTERS } from '../../../lib/roadmapFilters'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }
  if (!(await requireReadAccess(req, res, db))) return

  const [categories, topics, duration] = await Promise.all([
    db.all(
      `SELECT roadmap_categories.key, roadmap_categories.label, COUNT(roadmaps.id) AS roadmap_count
       FROM roadmap_categories
       INNER JOIN roadmaps ON roadmaps.category_id = roadmap_categories.id
       GROUP BY roadmap_categories.id
       ORDER BY roadmap_categories.label COLLATE NOCASE, roadmap_categories.key`
    ),
    db.all(
      `SELECT topics.key, topics.label, COUNT(roadmap_topics.roadmap_id) AS roadmap_count
       FROM topics
       INNER JOIN roadmap_topics ON roadmap_topics.topic_id = topics.id
       GROUP BY topics.id
       ORDER BY topics.label COLLATE NOCASE, topics.key`
    ),
    db.get(
      `SELECT MIN(duration_weeks_min) AS min_weeks,
              MAX(duration_weeks_max) AS max_weeks,
              SUM(CASE WHEN duration_weeks_min <= 4 AND duration_weeks_max >= 0 THEN 1 ELSE 0 END) AS up_to_4_count,
              SUM(CASE WHEN duration_weeks_min <= 12 AND duration_weeks_max >= 5 THEN 1 ELSE 0 END) AS from_5_to_12_count,
              SUM(CASE WHEN duration_weeks_max >= 13 THEN 1 ELSE 0 END) AS over_12_count
       FROM roadmaps`
    )
  ])

  const levelCounts = await db.all(
    `SELECT level AS key, COUNT(DISTINCT roadmap_id) AS roadmap_count
     FROM modules WHERE level IS NOT NULL GROUP BY level`
  )
  const counts = new Map(levelCounts.map((row: any) => [row.key, row.roadmap_count]))

  return res.status(200).json({
    categories,
    topics,
    levels: MODULE_LEVELS.map(key => ({ key, roadmap_count: counts.get(key) ?? 0 })),
    duration: {
      min_weeks: duration?.min_weeks ?? null,
      max_weeks: duration?.max_weeks ?? null
    },
    duration_ranges: ROADMAP_DURATION_FILTERS.map((range, index) => ({
      key: range.key,
      label: range.label,
      roadmap_count: Number([
        duration?.up_to_4_count,
        duration?.from_5_to_12_count,
        duration?.over_12_count
      ][index] ?? 0)
    })),
    unclassified_roadmaps: (await db.get(
      'SELECT COUNT(*) AS count FROM roadmaps WHERE category_id IS NULL'
    )).count
  })
}
