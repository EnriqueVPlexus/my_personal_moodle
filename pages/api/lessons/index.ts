import type { NextApiRequest, NextApiResponse } from 'next'
import { createServices } from '../../../lib/container'
import { writeAuditLog } from '../../../lib/http/audit'
import { getRoadmapReadScope, requireAdmin } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { createLessonBodySchema, lessonListQuerySchema } from '../../../lib/validation/lessons'
import { parseOrRespond } from '../../../lib/validation/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const { content } = createServices(db)

  if (req.method === 'GET') {
    const query = parseOrRespond(lessonListQuerySchema, req.query, res)
    if (!query) return
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return

    return res.status(200).json(await content.listLessons(scope, query.module_id))
  }

  if (req.method === 'POST') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const body = parseOrRespond(createLessonBodySchema, req.body, res)
    if (!body) return
    const { title, module_id } = body

    const created = await content.createLesson({ module_id, title })
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'lesson.create',
      entityType: 'lesson',
      entityId: created.id,
      details: { title, module_id }
    })
    return res.status(201).json(created.lesson)
  }

  res.setHeader('Allow', 'GET, POST')
  res.status(405).end('Method Not Allowed')
}
