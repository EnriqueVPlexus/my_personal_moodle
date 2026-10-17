import type { NextApiRequest, NextApiResponse } from 'next'
import { createServices } from '../../../lib/container'
import { requireUser } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }

  const db = await openDb()
  const user = await requireUser(req, res, db)
  if (!user) return

  const portfolio = await createServices(db).progress.getPortfolio(user.id)
  if (!portfolio) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  return res.status(200).json(portfolio)
}
