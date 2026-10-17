import type { NextApiRequest, NextApiResponse } from 'next'
import { withApiErrors } from '../../../lib/http/errors'
import { createServices } from '../../../lib/container'
import { writeAuditLog } from '../../../lib/http/audit'
import { getRoadmapReadScope, requireAdmin } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { parseOrRespond } from '../../../lib/validation/http'
import { lessonIdQuerySchema, updateLessonBodySchema } from '../../../lib/validation/lessons'
import { methodNotAllowed } from '../../../lib/http/methods'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const { content } = createServices(db)

  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'DELETE') {
    return methodNotAllowed(res, 'GET, PUT, DELETE')
  }

  const params = parseOrRespond(lessonIdQuerySchema, req.query, res)
  if (!params) return
  const { id } = params

  if (req.method === 'GET') {
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return
    const lesson = await content.getLesson(scope, id)
    if (!lesson) return res.status(404).json({ error: 'No encontrado.' })
    return res.status(200).json(lesson)
  }

  if (req.method === 'PUT') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const body = parseOrRespond(updateLessonBodySchema, req.body, res)
    if (!body) return
    const { title } = body
    const completed = body.completed ?? false

    const updated = await content.updateLesson(id, { title, completed })
    if (!updated) return res.status(404).json({ error: 'Lección no encontrada.' })

    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'lesson.update',
      entityType: 'lesson',
      entityId: String(id),
      details: { title, completed }
    })
    return res.status(200).json(updated.lesson)
  }

  if (req.method === 'DELETE') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return

    const lesson = await content.deleteLesson(id)
    if (!lesson) return res.status(404).json({ error: 'Lección no encontrada.' })

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

export default withApiErrors(handler)
