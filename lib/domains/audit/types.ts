/** Who performed the audited action (a subset of the authenticated user). */
export type AuditActor = {
  id: number
  email: string
}

/** Transport-agnostic request metadata attached to every audit entry. */
export type AuditContext = {
  ip: string | null
  userAgent: string | null
}

export type AuditEvent = {
  actor?: AuditActor | null
  action: string
  entityType: string
  entityId?: number | string | null
  details?: Record<string, unknown>
}

export type AuditLogEntry = {
  id: number
  actor_user_id: number | null
  actor_email: string | null
  action: string
  entity_type: string
  entity_id: string | null
  details: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: Date | string
}

export type NewAuditLogEntry = Omit<AuditLogEntry, 'id'>
