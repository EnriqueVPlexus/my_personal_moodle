import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/auth'
import { openDb } from '../../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const { id } = req.query

  if (req.method === 'GET') {
    const lesson = await db.get('SELECT * FROM lessons WHERE id = ?', [id])
    if (!lesson) return res.status(404).json({ error: 'not found' })
    return res.status(200).json(lesson)
  }

  if (req.method === 'PUT') {
    if (!(await requireAdmin(req, res, db))) return
    const { title, completed } = req.body
    await db.run('UPDATE lessons SET title = ?, completed = ? WHERE id = ?', [title, completed ? 1 : 0, id])
    const updated = await db.get('SELECT * FROM lessons WHERE id = ?', [id])
    return res.status(200).json(updated)
  }

  if (req.method === 'DELETE') {
    if (!(await requireAdmin(req, res, db))) return
    await db.run('DELETE FROM lessons WHERE id = ?', [id])
    return res.status(204).end()
  }

  res.setHeader('Allow', 'GET, PUT, DELETE')
  res.status(405).end('Method Not Allowed')
}
