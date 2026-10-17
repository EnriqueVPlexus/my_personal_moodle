import type { NextApiRequest, NextApiResponse } from 'next'
import { createServices } from '../../../lib/container'
import { getRoadmapReadScope } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }
  const scope = await getRoadmapReadScope(req, res, db)
  if (!scope) return

  return res.status(200).json(await createServices(db).content.getCatalogMetadata(scope))
}
