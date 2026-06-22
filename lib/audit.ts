import type { NextApiRequest } from 'next'
import type { AuthUser } from './auth'

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
  await db.run(
    `INSERT INTO audit_logs (
      actor_user_id, actor_email, action, entity_type, entity_id, details, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user?.id || null,
      user?.email || null,
      action,
      entityType,
      entityId === undefined ? null : String(entityId),
      details ? JSON.stringify(details) : null,
      requestIp(req),
      getHeaderValue(req.headers['user-agent']) || null,
      new Date().toISOString()
    ]
  )
}
