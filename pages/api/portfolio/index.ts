import type { NextApiRequest, NextApiResponse } from 'next'
import { withApiErrors } from '../../../lib/http/errors'
import { createServices } from '../../../lib/container'
import { requireUser } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { methodNotAllowed } from '../../../lib/http/methods'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, 'GET')
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

export default withApiErrors(handler)
