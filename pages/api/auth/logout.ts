import type { NextApiRequest, NextApiResponse } from 'next'
import { clearSession, requireSameOrigin } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  if (!requireSameOrigin(req, res)) return

  const db = await openDb()
  await clearSession(req, res, db)
  return res.status(200).json({ ok: true })
}
