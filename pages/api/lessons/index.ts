import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { requireAdmin, requireReadAccess } from '../../../lib/auth'
import { openDb } from '../../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method === 'GET') {
    if (!(await requireReadAccess(req, res, db))) return
    const { module_id } = req.query
    if (!module_id) return res.status(400).json({ error: 'module_id required' })
    const rows = await db.all('SELECT * FROM lessons WHERE module_id = ? ORDER BY id', [module_id])
    return res.status(200).json(rows)
  }

  if (req.method === 'POST') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const { title, module_id } = req.body
    if (!title || !module_id) return res.status(400).json({ error: 'title and module_id required' })
    const result = await db.run('INSERT INTO lessons (module_id, title, completed) VALUES (?, ?, ?)', [module_id, title, 0])
    const row = await db.get('SELECT * FROM lessons WHERE id = ?', [result.lastID])
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'lesson.create',
      entityType: 'lesson',
      entityId: result.lastID,
      details: { title, module_id }
    })
    return res.status(201).json(row)
  }

  res.setHeader('Allow', 'GET, POST')
  res.status(405).end('Method Not Allowed')
}
