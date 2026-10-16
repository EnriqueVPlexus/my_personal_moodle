import type { NextApiRequest, NextApiResponse } from 'next'
import { getUserFromRequest } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { methodNotAllowed } from '../../../lib/http/methods'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, 'GET')
  }

  const db = await openDb()
  const user = await getUserFromRequest(req, db)
  return res.status(200).json({ user })
}
