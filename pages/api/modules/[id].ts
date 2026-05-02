import type { NextApiRequest, NextApiResponse } from 'next'
import { openDb } from '../../../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const { id } = req.query

  if (req.method === 'GET') {
    const moduleRow = await db.get('SELECT * FROM modules WHERE id = ?', [id])
    if (!moduleRow) return res.status(404).json({ error: 'not found' })
    const lessons = await db.all('SELECT * FROM lessons WHERE module_id = ? ORDER BY id', [id])
    return res.status(200).json({ ...moduleRow, lessons })
  }

  if (req.method === 'PUT') {
    const { title } = req.body
    await db.run('UPDATE modules SET title = ? WHERE id = ?', [title, id])
    const updated = await db.get('SELECT * FROM modules WHERE id = ?', [id])
    return res.status(200).json(updated)
  }

  if (req.method === 'DELETE') {
    await db.run('DELETE FROM modules WHERE id = ?', [id])
    return res.status(204).end()
  }

  res.setHeader('Allow', 'GET, PUT, DELETE')
  res.status(405).end('Method Not Allowed')
}
