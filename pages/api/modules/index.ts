import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { getRoadmapReadScope, requireAdmin, scopeAllowsRoadmap } from '../../../lib/auth'
import { openDb } from '../../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method === 'GET') {
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return
    const { roadmap_id } = req.query
    if (roadmap_id) {
      if (!scopeAllowsRoadmap(scope, roadmap_id)) return res.status(200).json([])
      const rows = await db.all(
        'SELECT * FROM modules WHERE roadmap_id = ? ORDER BY COALESCE(position, id), id',
        [roadmap_id]
      )
      return res.status(200).json(rows)
    }

    if (!scope.allRoadmaps && scope.roadmapIds.length === 0) return res.status(200).json([])
    if (!scope.allRoadmaps) {
      const rows = await db.all(
        `SELECT * FROM modules WHERE roadmap_id IN (${scope.roadmapIds.map(() => '?').join(', ')}) ORDER BY id DESC`,
        scope.roadmapIds
      )
      return res.status(200).json(rows)
    }

    const rows = await db.all('SELECT * FROM modules ORDER BY id DESC')
    return res.status(200).json(rows)
  }

  if (req.method === 'POST') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const { title, roadmap_id } = req.body
    if (!title || !roadmap_id) return res.status(400).json({ error: 'title and roadmap_id required' })
    const result = await db.run('INSERT INTO modules (roadmap_id, title) VALUES (?, ?)', [roadmap_id, title])
    const row = await db.get('SELECT * FROM modules WHERE id = ?', [result.lastID])
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'module.create',
      entityType: 'module',
      entityId: result.lastID,
      details: { title, roadmap_id }
    })
    return res.status(201).json(row)
  }

  res.setHeader('Allow', 'GET, POST')
  res.status(405).end('Method Not Allowed')
}
