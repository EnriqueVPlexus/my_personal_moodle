import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { getRoadmapReadScope, requireAdmin, scopeAllowsRoadmap } from '../../../lib/auth'
import { openDb } from '../../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const { id } = req.query

  if (req.method === 'GET') {
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return
    const lesson = await db.get(`
      SELECT lessons.*, modules.roadmap_id
      FROM lessons
      INNER JOIN modules ON modules.id = lessons.module_id
      WHERE lessons.id = ?
    `, [id])
    if (!lesson) return res.status(404).json({ error: 'not found' })
    if (!scopeAllowsRoadmap(scope, lesson.roadmap_id)) return res.status(404).json({ error: 'not found' })
    const { roadmap_id: _roadmapId, ...lessonBody } = lesson
    return res.status(200).json(lessonBody)
  }

  if (req.method === 'PUT') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const { title, completed } = req.body
    const result = await db.run('UPDATE lessons SET title = ?, completed = ? WHERE id = ?', [title, completed ? 1 : 0, id])
    if (!result.changes) return res.status(404).json({ error: 'lesson not found' })
    
    const updated = await db.get('SELECT * FROM lessons WHERE id = ?', [id])
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'lesson.update',
      entityType: 'lesson',
      entityId: String(id),
      details: { title, completed: Boolean(completed) }
    })
    return res.status(200).json(updated)
  }

  if (req.method === 'DELETE') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const lesson = await db.get('SELECT title, module_id FROM lessons WHERE id = ?', [id])
    if (!lesson) return res.status(404).json({ error: 'lesson not found' })
    
    await db.run('DELETE FROM lessons WHERE id = ?', [id])
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'lesson.delete',
      entityType: 'lesson',
      entityId: String(id),
      details: { title: lesson?.title || null, module_id: lesson?.module_id || null }
    })
    return res.status(204).end()
  }

  res.setHeader('Allow', 'GET, PUT, DELETE')
  res.status(405).end('Method Not Allowed')
}
