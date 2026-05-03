import type { NextApiRequest, NextApiResponse } from 'next'
import { openDb } from '../../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }

  const db = await openDb()
  const row = await db.get('SELECT COUNT(*) AS count FROM users')
  return res.status(200).json({
    needsSetup: Number(row.count) === 0,
    requiresToken: Boolean(process.env.AUTH_SETUP_TOKEN),
    productionRequiresToken: process.env.NODE_ENV === 'production'
  })
}
