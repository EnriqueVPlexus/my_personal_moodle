import type { AuditLogEntry, NewAuditLogEntry } from './types'

/** Persistence port the audit service depends on. */
export interface AuditLogRepository {
  insert(entry: NewAuditLogEntry): Promise<void>
  list(limit: number): Promise<AuditLogEntry[]>
}
