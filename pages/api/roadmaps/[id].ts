import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/http/audit'
import { getRoadmapReadScope, requireAdmin, scopeAllowsRoadmap } from '../../../lib/auth'
import { openDb } from '../../../lib/persistence'
import { getRoadmapDetailProgress, touchRoadmapProgress } from '../../../lib/progressRepository'
import { getRoadmapTopics, saveRoadmapMetadata } from '../../../lib/roadmapMetadata'
import { findRoadmapById, updateRoadmapCore } from '../../../lib/roadmapRepository'
import { parseOrRespond } from '../../../lib/validation/http'
import { roadmapIdQuerySchema, updateRoadmapBodySchema } from '../../../lib/validation/roadmaps'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'GET, PUT, DELETE')
    return res.status(405).end('Method Not Allowed')
  }

  const params = parseOrRespond(roadmapIdQuerySchema, req.query, res)
  if (!params) return
  const { id } = params

  if (req.method === 'GET') {
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return
    if (!scopeAllowsRoadmap(scope, id)) return res.status(404).json({ error: 'No encontrado.' })
    const roadmap = await findRoadmapById(db, id)
    if (!roadmap) return res.status(404).json({ error: 'No encontrado.' })
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
    const body = parseOrRespond(updateRoadmapBodySchema, req.body, res)
    if (!body) return
    const { title, description, duration, category, durationWeeks, version, publishedAt } = body
    const normalizedTopics = body.topics ?? []
    const hasCategory = category !== undefined
    const hasTopics = body.topics !== undefined
    const changes = await updateRoadmapCore(db, id, {
      title,
      description: description || null,
      ...(duration !== undefined ? { duration: duration || null } : {}),
      ...(durationWeeks ? { durationWeeks: { min: durationWeeks.min, max: durationWeeks.max } } : {}),
      ...(version !== undefined ? { version } : {}),
      ...(publishedAt !== undefined ? { publishedAt } : {})
    })
    if (!changes) return res.status(404).json({ error: 'Roadmap no encontrado.' })
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
}
