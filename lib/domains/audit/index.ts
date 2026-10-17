import type { DatabaseClient } from '../../persistence/database'
import { createAuditLogRepository } from './repositories/auditRepository'
import { makeAuditService } from './service'

export type { AuditService } from './service'
export type { AuditContext, AuditActor, AuditEvent, AuditLogEntry } from './types'

export function createAuditService(db: DatabaseClient) {
  return makeAuditService(createAuditLogRepository(db))
}
