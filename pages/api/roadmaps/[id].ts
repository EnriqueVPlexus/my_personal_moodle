import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/auth'
import { openDb } from '../../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const { id } = req.query

  if (req.method === 'GET') {
    const roadmap = await db.get('SELECT * FROM roadmaps WHERE id = ?', [id])
    if (!roadmap) return res.status(404).json({ error: 'not found' })
    const modules = await db.all(
      'SELECT * FROM modules WHERE roadmap_id = ? ORDER BY COALESCE(position, id), id',
      [id]
    )
    return res.status(200).json({ ...roadmap, modules })
  }

  if (req.method === 'PUT') {
    if (!(await requireAdmin(req, res, db))) return
    const { title, description } = req.body
    await db.run('UPDATE roadmaps SET title = ?, description = ? WHERE id = ?', [title, description || null, id])
    const updated = await db.get('SELECT * FROM roadmaps WHERE id = ?', [id])
    return res.status(200).json(updated)
  }

  if (req.method === 'DELETE') {
    if (!(await requireAdmin(req, res, db))) return
    await db.run('DELETE FROM roadmaps WHERE id = ?', [id])
    return res.status(204).end()
  }

  res.setHeader('Allow', 'GET, PUT, DELETE')
  res.status(405).end('Method Not Allowed')
}
