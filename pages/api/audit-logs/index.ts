import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/auth'
import { openDb } from '../../../lib/db'
import { listAuditLogs } from '../../../lib/auditRepository'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }

  if (!(await requireAdmin(req, res, db))) return

  const rows = await listAuditLogs(db, 200)

  return res.status(200).json(rows)
}
