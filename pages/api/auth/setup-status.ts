import type { NextApiRequest, NextApiResponse } from 'next'
import { openDb } from '../../../lib/persistence'
import { createAuthService } from '../../../lib/domains/auth'
import { methodNotAllowed } from '../../../lib/http/methods'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, 'GET')
  }

  const db = await openDb()
  const needsSetup = await createAuthService(db).needsSetup()
  return res.status(200).json({
    needsSetup,
    requiresToken: Boolean(process.env.AUTH_SETUP_TOKEN),
    productionRequiresToken: process.env.NODE_ENV === 'production'
  })
}
