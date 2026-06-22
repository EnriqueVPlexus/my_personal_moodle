import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/auth'
import { openDb } from '../../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }

  if (!(await requireAdmin(req, res, db))) return

  const rows = await db.all(
    `SELECT id, actor_user_id, actor_email, action, entity_type, entity_id, details, ip_address, user_agent, created_at
     FROM audit_logs
     ORDER BY datetime(created_at) DESC, id DESC
     LIMIT 200`
  )

  return res.status(200).json(rows)
}
