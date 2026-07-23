import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/auth'
import { openDb } from '../../../lib/db'

function optionalPositiveId(value: string | string[] | undefined) {
  if (value === undefined) return null
  const id = Number(Array.isArray(value) ? value[0] : value)
  return Number.isInteger(id) && id > 0 ? id : NaN
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }

  if (!(await requireAdmin(req, res, db))) return

  const userId = optionalPositiveId(req.query.user_id)
  const moduleId = optionalPositiveId(req.query.module_id)
  const roadmapId = optionalPositiveId(req.query.roadmap_id)
  if ([userId, moduleId, roadmapId].some(value => Number.isNaN(value))) {
    return res.status(400).json({ error: 'invalid filter id' })
  }

  const filters: string[] = []
  const params: number[] = []
  if (userId) {
    filters.push('e.user_id = ?')
    params.push(userId)
  }
  if (moduleId) {
    filters.push('e.module_id = ?')
    params.push(moduleId)
  }
  if (roadmapId) {
    filters.push('m.roadmap_id = ?')
    params.push(roadmapId)
  }

  const evidences = await db.all(
    `SELECT e.id, e.user_id, e.module_id, e.evidence_type, e.url, e.note,
            e.created_at, e.updated_at,
            u.email AS user_email, u.name AS user_name,
            m.title AS module_title, m.position AS module_position,
            r.id AS roadmap_id, r.title AS roadmap_title
     FROM user_module_evidences e
     INNER JOIN users u ON u.id = e.user_id
     INNER JOIN modules m ON m.id = e.module_id
     INNER JOIN roadmaps r ON r.id = m.roadmap_id
     ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
     ORDER BY e.updated_at DESC, e.id DESC`,
    params
  )

  return res.status(200).json(evidences)
}
