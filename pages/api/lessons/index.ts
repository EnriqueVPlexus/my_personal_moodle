import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { getRoadmapReadScope, requireAdmin, scopeAllowsRoadmap } from '../../../lib/auth'
import { openDb } from '../../../lib/persistence'
import { findLessonById, findLessonsByModuleId, insertLesson } from '../../../lib/lessonRepository'
import { findModuleById } from '../../../lib/moduleRepository'
import { createLessonBodySchema, lessonListQuerySchema } from '../../../lib/validation/lessons'
import { parseOrRespond } from '../../../lib/validation/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method === 'GET') {
    const query = parseOrRespond(lessonListQuerySchema, req.query, res)
    if (!query) return
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return
    const { module_id } = query
    const moduleRow = await findModuleById(db, module_id)
    if (!moduleRow || !scopeAllowsRoadmap(scope, moduleRow.roadmap_id)) return res.status(200).json([])
    const rows = await findLessonsByModuleId(db, module_id)
    return res.status(200).json(rows)
  }

  if (req.method === 'POST') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const body = parseOrRespond(createLessonBodySchema, req.body, res)
    if (!body) return
    const { title, module_id } = body
    const newId = await insertLesson(db, { module_id, title })
    const row = await findLessonById(db, newId)
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'lesson.create',
      entityType: 'lesson',
      entityId: newId,
      details: { title, module_id }
    })
    return res.status(201).json(row)
  }

  res.setHeader('Allow', 'GET, POST')
  res.status(405).end('Method Not Allowed')
}
