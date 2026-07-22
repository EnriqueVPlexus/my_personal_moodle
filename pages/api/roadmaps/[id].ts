import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { getRoadmapReadScope, requireAdmin, scopeAllowsRoadmap } from '../../../lib/auth'
import { openDb } from '../../../lib/db'
import { getRoadmapDetailProgress, touchRoadmapProgress } from '../../../lib/progress'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const { id } = req.query

  if (req.method === 'GET') {
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return
    if (!scopeAllowsRoadmap(scope, id)) return res.status(404).json({ error: 'not found' })
    const roadmap = await db.get('SELECT * FROM roadmaps WHERE id = ?', [id])
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
    const modules = await db.all(
      'SELECT * FROM modules WHERE roadmap_id = ? ORDER BY COALESCE(position, id), id',
      [id]
    )
    const modulesWithProgress = progress
      ? modules.map((module: any) => ({
        ...module,
        progress: progress.modules.find(item => item.module_id === module.id) || null
      }))
      : modules

    return res.status(200).json({ ...roadmap, modules: modulesWithProgress, progress })
  }

  if (req.method === 'PUT') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const { title, description } = req.body
    const result = await db.run('UPDATE roadmaps SET title = ?, description = ? WHERE id = ?', [title, description || null, id])
    if (!result.changes) return res.status(404).json({ error: 'roadmap not found' })
    
    const updated = await db.get('SELECT * FROM roadmaps WHERE id = ?', [id])
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'roadmap.update',
      entityType: 'roadmap',
      entityId: String(id),
      details: { title }
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
