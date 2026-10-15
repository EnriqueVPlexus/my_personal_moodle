import type { NextApiRequest } from 'next'
import type { AuthUser } from '../auth'
import { createAuditService, type AuditContext } from '../domains/audit'
import type { DatabaseClient } from '../persistence'
import { getHeaderValue } from './headers'

type AuditInput = {
  db: DatabaseClient
  req: NextApiRequest
  user?: AuthUser | null
  action: string
  entityType: string
  entityId?: number | string | null
  details?: Record<string, unknown>
}

function requestIp(req: NextApiRequest) {
  const forwardedFor = getHeaderValue(req.headers['x-forwarded-for'])
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return req.socket.remoteAddress || null
}

/** Builds the transport-agnostic audit context from a Next.js request. */
export function auditContextFromRequest(req: NextApiRequest): AuditContext {
  return {
    ip: requestIp(req),
    userAgent: getHeaderValue(req.headers['user-agent']) || null
  }
}

/** HTTP adapter: records an audit event for the current request. */
export async function writeAuditLog({ db, req, user, action, entityType, entityId, details }: AuditInput) {
  await createAuditService(db).record(
    { actor: user ?? null, action, entityType, entityId, details },
    auditContextFromRequest(req)
  )
}
