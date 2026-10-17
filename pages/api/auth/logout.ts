import type { NextApiRequest, NextApiResponse } from 'next'
import { withApiErrors } from '../../../lib/http/errors'
import { clearSession, requireSameOrigin } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { methodNotAllowed } from '../../../lib/http/methods'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, 'POST')
  }

  if (!requireSameOrigin(req, res)) return

  const db = await openDb()
  await clearSession(req, res, db)
  return res.status(200).json({ ok: true })
}

export default withApiErrors(handler)
