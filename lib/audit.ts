import type { NextApiRequest } from 'next'
import type { AuthUser } from './auth'
import { insertAuditLog } from './auditRepository'

type AuditInput = {
  db: any
  req: NextApiRequest
  user?: AuthUser | null
  action: string
  entityType: string
  entityId?: number | string | null
  details?: Record<string, unknown>
}

function getHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function requestIp(req: NextApiRequest) {
  const forwardedFor = getHeaderValue(req.headers['x-forwarded-for'])
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return req.socket.remoteAddress || null
}

export async function writeAuditLog({ db, req, user, action, entityType, entityId, details }: AuditInput) {
  await insertAuditLog(db, {
    actor_user_id: user?.id || null,
    actor_email: user?.email || null,
    action,
    entity_type: entityType,
    entity_id: entityId === undefined ? null : String(entityId),
    details: details ? JSON.stringify(details) : null,
    ip_address: requestIp(req),
    user_agent: getHeaderValue(req.headers['user-agent']) || null,
    created_at: new Date().toISOString()
  })
}
