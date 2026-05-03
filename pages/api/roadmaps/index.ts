import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { requireAdmin, requireReadAccess } from '../../../lib/auth'
import { openDb } from '../../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method === 'GET') {
    if (!(await requireReadAccess(req, res, db))) return
    const rows = await db.all(`
      SELECT roadmaps.*, COUNT(modules.id) AS module_count
      FROM roadmaps
      LEFT JOIN modules ON modules.roadmap_id = roadmaps.id
      GROUP BY roadmaps.id
      ORDER BY roadmaps.id DESC
    `)
    return res.status(200).json(rows)
  }

  if (req.method === 'POST') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const { title, description } = req.body
    if (!title) return res.status(400).json({ error: 'title required' })
    const result = await db.run('INSERT INTO roadmaps (title, description) VALUES (?, ?)', [title, description || null])
    const id = result.lastID
    const row = await db.get('SELECT * FROM roadmaps WHERE id = ?', [id])
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'roadmap.create',
      entityType: 'roadmap',
      entityId: id,
      details: { title }
    })
    return res.status(201).json(row)
  }

  res.setHeader('Allow', 'GET, POST')
  res.status(405).end('Method Not Allowed')
}
