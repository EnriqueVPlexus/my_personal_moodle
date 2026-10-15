import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { getRoadmapReadScope, requireAdmin, scopeAllowsRoadmap } from '../../../lib/auth'
import { openDb } from '../../../lib/persistence'
import { deleteLesson, findLessonById, findLessonWithRoadmapId, updateLesson } from '../../../lib/lessonRepository'
import { parseOrRespond } from '../../../lib/validation/http'
import { lessonIdQuerySchema, updateLessonBodySchema } from '../../../lib/validation/lessons'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'GET, PUT, DELETE')
    return res.status(405).end('Method Not Allowed')
  }

  const params = parseOrRespond(lessonIdQuerySchema, req.query, res)
  if (!params) return
  const { id } = params

  if (req.method === 'GET') {
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return
    const lesson = await findLessonWithRoadmapId(db, id)
    if (!lesson) return res.status(404).json({ error: 'No encontrado.' })
    if (!scopeAllowsRoadmap(scope, lesson.roadmap_id)) return res.status(404).json({ error: 'No encontrado.' })
    const { roadmap_id: _roadmapId, ...lessonBody } = lesson
    return res.status(200).json(lessonBody)
  }

  if (req.method === 'PUT') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const body = parseOrRespond(updateLessonBodySchema, req.body, res)
    if (!body) return
    const { title } = body
    const completed = body.completed ?? false
    const changes = await updateLesson(db, id, { title, completed })
    if (!changes) return res.status(404).json({ error: 'Lección no encontrada.' })

    const updated = await findLessonById(db, id)
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'lesson.update',
      entityType: 'lesson',
      entityId: String(id),
      details: { title, completed }
    })
    return res.status(200).json(updated)
  }

  if (req.method === 'DELETE') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const lesson = await findLessonById(db, id)
    if (!lesson) return res.status(404).json({ error: 'Lección no encontrada.' })

    await deleteLesson(db, id)
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
}
