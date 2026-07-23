import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { getRoadmapReadScope, requireAdmin, scopeAllowsRoadmap } from '../../../lib/auth'
import { openDb } from '../../../lib/db'
import { getRoadmapDetailProgress, touchRoadmapProgress } from '../../../lib/progress'
import {
  getRoadmapTopics,
  normalizeDurationRange,
  normalizeTopics,
  parseDurationWeeks,
  saveRoadmapMetadata
} from '../../../lib/roadmapMetadata'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const { id } = req.query

  if (req.method === 'GET') {
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return
    if (!scopeAllowsRoadmap(scope, id)) return res.status(404).json({ error: 'not found' })
    const roadmap = await db.get(
      `SELECT roadmaps.*, roadmap_categories.key AS category_key,
              roadmap_categories.label AS category_label
       FROM roadmaps
       LEFT JOIN roadmap_categories ON roadmap_categories.id = roadmaps.category_id
       WHERE roadmaps.id = ?`,
      [id]
    )
    if (!roadmap) return res.status(404).json({ error: 'not found' })
    const user = scope.user

    if (user) {
      await touchRoadmapProgress(db, {
        userId: user.id,
        roadmapId: roadmap.id
      })
    }

    const progress = user
      ? await getRoadmapDetailProgress(db, user.id, roadmap.id)
      : null
    const modules = user
      ? await db.all(
        `SELECT modules.*,
                EXISTS (
                  SELECT 1 FROM user_module_evidences
                  WHERE user_module_evidences.module_id = modules.id
                    AND user_module_evidences.user_id = ?
                ) AS has_evidence
         FROM modules
         WHERE modules.roadmap_id = ?
         ORDER BY COALESCE(modules.position, modules.id), modules.id`,
        [user.id, id]
      )
      : await db.all(
        'SELECT * FROM modules WHERE roadmap_id = ? ORDER BY COALESCE(position, id), id',
        [id]
      )
    const modulesWithProgress = progress
      ? modules.map((module: any) => ({
        ...module,
        progress: progress.modules.find(item => item.module_id === module.id) || null
      }))
      : modules

    const topics = await getRoadmapTopics(db, roadmap.id)

    const { category_key: categoryKey, category_label: categoryLabel, ...publicRoadmap } = roadmap
    return res.status(200).json({
      ...publicRoadmap,
      category: categoryKey && categoryLabel ? { key: categoryKey, label: categoryLabel } : null,
      topics,
      modules: modulesWithProgress,
      progress
    })
  }

  if (req.method === 'PUT') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const { title, description, duration, category, topics, duration_weeks_min, duration_weeks_max } = req.body
    if (!title) return res.status(400).json({ error: 'title required' })
    const hasDuration = Object.prototype.hasOwnProperty.call(req.body, 'duration')
    const hasDurationRange = Object.prototype.hasOwnProperty.call(req.body, 'duration_weeks_min') ||
      Object.prototype.hasOwnProperty.call(req.body, 'duration_weeks_max')
    const durationRange = hasDurationRange
      ? normalizeDurationRange(duration_weeks_min, duration_weeks_max)
      : hasDuration
        ? parseDurationWeeks(duration)
        : { min: null, max: null }
    if (!durationRange) return res.status(400).json({ error: 'invalid duration range' })
    const hasCategory = Object.prototype.hasOwnProperty.call(req.body, 'category')
    const hasTopics = Object.prototype.hasOwnProperty.call(req.body, 'topics')
    const normalizedTopics = normalizeTopics(topics)
    if (normalizedTopics.length > 20) return res.status(400).json({ error: 'a roadmap can have at most 20 topics' })
    const result = await db.run(
      `UPDATE roadmaps SET title = ?, description = ?,
       duration = CASE WHEN ? = 1 THEN ? ELSE duration END,
       duration_weeks_min = CASE WHEN ? = 1 THEN ? ELSE duration_weeks_min END,
       duration_weeks_max = CASE WHEN ? = 1 THEN ? ELSE duration_weeks_max END
       WHERE id = ?`,
      [
        title,
        description || null,
        hasDuration ? 1 : 0,
        duration || null,
        hasDuration || hasDurationRange ? 1 : 0,
        durationRange.min,
        hasDuration || hasDurationRange ? 1 : 0,
        durationRange.max,
        id
      ]
    )
    if (!result.changes) return res.status(404).json({ error: 'roadmap not found' })
    if (hasCategory || hasTopics) {
      const currentCategory = hasCategory
        ? category
        : (await db.get(
          `SELECT roadmap_categories.label FROM roadmaps
           LEFT JOIN roadmap_categories ON roadmap_categories.id = roadmaps.category_id
           WHERE roadmaps.id = ?`,
          [id]
        ))?.label
      const currentTopics = hasTopics ? normalizedTopics : await getRoadmapTopics(db, String(id))
      await saveRoadmapMetadata(
        db,
        String(id),
        currentCategory,
        Array.isArray(currentTopics) ? currentTopics.map((topic: any) => topic.label ?? topic) : []
      )
    }
    
    const updated = await db.get('SELECT * FROM roadmaps WHERE id = ?', [id])
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'roadmap.update',
      entityType: 'roadmap',
      entityId: String(id),
      details: { title, category: category || null, topics: normalizedTopics }
    })
    return res.status(200).json(updated)
  }

  if (req.method === 'DELETE') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const roadmap = await db.get('SELECT title FROM roadmaps WHERE id = ?', [id])
    await db.run('DELETE FROM roadmaps WHERE id = ?', [id])
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'roadmap.delete',
      entityType: 'roadmap',
      entityId: String(id),
      details: { title: roadmap?.title || null }
    })
    return res.status(204).end()
  }

  res.setHeader('Allow', 'GET, PUT, DELETE')
  res.status(405).end('Method Not Allowed')
}
