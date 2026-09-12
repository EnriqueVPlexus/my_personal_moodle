import type { NextApiRequest, NextApiResponse } from 'next'
import { getAdminDashboard } from '../../../lib/adminDashboard'
import { requireAdmin } from '../../../lib/auth'
import { openDb } from '../../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }

  if (!(await requireAdmin(req, res, db))) return

  return res.status(200).json(await getAdminDashboard(db))
}
