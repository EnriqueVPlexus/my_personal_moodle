import type { AuditLogRepository } from './ports'
import type { AuditContext, AuditEvent, AuditLogEntry } from './types'

export const DEFAULT_AUDIT_LIST_LIMIT = 200

export type AuditService = {
  record(event: AuditEvent, context: AuditContext): Promise<void>
  list(limit?: number): Promise<AuditLogEntry[]>
}

export function makeAuditService(
  repository: AuditLogRepository,
  now: () => Date = () => new Date()
): AuditService {
  return {
    async record(event, context) {
      await repository.insert({
        actor_user_id: event.actor?.id || null,
        actor_email: event.actor?.email || null,
        action: event.action,
        entity_type: event.entityType,
        entity_id: event.entityId === undefined ? null : String(event.entityId),
        details: event.details ? JSON.stringify(event.details) : null,
        ip_address: context.ip,
        user_agent: context.userAgent,
        created_at: now().toISOString()
      })
    },
    list(limit = DEFAULT_AUDIT_LIST_LIMIT) {
      return repository.list(limit)
    }
  }
}
