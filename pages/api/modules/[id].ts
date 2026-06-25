import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { requireAdmin, requireReadAccess } from '../../../lib/auth'
import { openDb } from '../../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const { id } = req.query

  if (req.method === 'GET') {
    if (!(await requireReadAccess(req, res, db))) return
    const moduleRow = await db.get('SELECT * FROM modules WHERE id = ?', [id])
    if (!moduleRow) return res.status(404).json({ error: 'not found' })
    const lessons = await db.all('SELECT * FROM lessons WHERE module_id = ? ORDER BY id', [id])
    return res.status(200).json({ ...moduleRow, lessons })
  }

  if (req.method === 'PUT') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const { title } = req.body
    const result = await db.run('UPDATE modules SET title = ? WHERE id = ?', [title, id])
    if (!result.changes) return res.status(404).json({ error: 'module not found' })
    
    const updated = await db.get('SELECT * FROM modules WHERE id = ?', [id])
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'module.update',
      entityType: 'module',
      entityId: String(id),
      details: { title }
    })
    return res.status(200).json(updated)
  }

  if (req.method === 'DELETE') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const moduleRow = await db.get('SELECT title, roadmap_id FROM modules WHERE id = ?', [id])
    if (!moduleRow) return res.status(404).json({ error: 'module not found' })
    
    await db.run('DELETE FROM modules WHERE id = ?', [id])
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'module.delete',
      entityType: 'module',
      entityId: String(id),
      details: { title: moduleRow?.title || null, roadmap_id: moduleRow?.roadmap_id || null }
    })
    return res.status(204).end()
  }

  res.setHeader('Allow', 'GET, PUT, DELETE')
  res.status(405).end('Method Not Allowed')
}
