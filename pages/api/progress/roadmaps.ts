import type { NextApiRequest, NextApiResponse } from 'next'
import { createServices } from '../../../lib/container'
import { requireUser } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { methodNotAllowed } from '../../../lib/http/methods'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, 'GET')
  }

  const db = await openDb()
  const user = await requireUser(req, res, db)
  if (!user) return

  const progress = await createServices(db).progress.listRoadmapProgress(user.id)
  return res.status(200).json(progress)
}
