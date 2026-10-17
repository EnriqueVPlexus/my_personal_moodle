import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { createAuditService } from '../../../lib/domains/audit'
import { methodNotAllowed } from '../../../lib/http/methods'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method !== 'GET') {
    return methodNotAllowed(res, 'GET')
  }

  if (!(await requireAdmin(req, res, db))) return

  const rows = await createAuditService(db).list(200)

  return res.status(200).json(rows)
}
