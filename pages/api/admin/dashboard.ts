import type { NextApiRequest, NextApiResponse } from 'next'
import { withApiErrors } from '../../../lib/http/errors'
import { createServices } from '../../../lib/container'
import { requireAdmin } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { methodNotAllowed } from '../../../lib/http/methods'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method !== 'GET') {
    return methodNotAllowed(res, 'GET')
  }

  if (!(await requireAdmin(req, res, db))) return

  return res.status(200).json(await createServices(db).admin.getDashboard())
}

export default withApiErrors(handler)
