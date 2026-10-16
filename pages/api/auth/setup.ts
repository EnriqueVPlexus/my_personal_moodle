import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/http/audit'
import { createSession, requireSameOrigin, validateSetupToken } from '../../../lib/http/auth'
import { rateLimit, clearRateLimit } from '../../../lib/http/rateLimit'
import { openDb } from '../../../lib/persistence'
import { createAuthService } from '../../../lib/domains/auth'
import { setupBodySchema } from '../../../lib/validation/auth'
import { parseOrRespond } from '../../../lib/validation/http'
import { methodNotAllowed } from '../../../lib/http/methods'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, 'POST')
  }

  const db = await openDb()

  // Apply rate limiting to prevent brute force attacks on setup
  if (!(await rateLimit(db, req, res, { maxAttempts: 3, windowMs: 60 * 1000, scope: 'setup' }))) return

  // Validate setup token first before checking origin (fail faster on auth errors)
  const rawBody = (req.body && typeof req.body === 'object' ? req.body : {}) as { setupToken?: unknown }
  const { setupToken } = rawBody
  if (!validateSetupToken(typeof setupToken === 'string' ? setupToken : undefined)) {
    return res.status(403).json({ error: 'Se requiere el token de configuración inicial.' })
  }

  if (!requireSameOrigin(req, res)) return

  const body = parseOrRespond(setupBodySchema, req.body, res)
  if (!body) return
  const { email, name, password } = body

  const result = await createAuthService(db).createFirstAdmin({ email, name, password })
  if (result.status === 'already_configured') {
    return res.status(409).json({ error: 'La configuración inicial ya se completó.' })
  }
  if (result.status === 'failed') {
    return res.status(500).json({ error: 'No se pudo crear el usuario.' })
  }
  const userId = result.userId

  await createSession(res, userId, db)
  await clearRateLimit(db, req, 'setup')

  await writeAuditLog({
    db,
    req,
    action: 'auth.setup_admin',
    entityType: 'user',
    entityId: userId,
    details: { email }
  })
  return res.status(201).json({ user: { id: userId, email, name, role: 'admin' } })
}
