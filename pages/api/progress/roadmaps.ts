import type { NextApiRequest, NextApiResponse } from 'next'
import { requireUser } from '../../../lib/auth'
import { openDb } from '../../../lib/db'
import { listUserRoadmapProgress } from '../../../lib/progress'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }

  const db = await openDb()
  const user = await requireUser(req, res, db)
  if (!user) return

  const progress = await listUserRoadmapProgress(db, user.id)
  return res.status(200).json(progress)
}
