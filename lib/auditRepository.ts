import { Insertable, Selectable } from 'kysely'
import type { DatabaseClient } from './database'
import type { PostgresDb } from './postgresDb'
import { getQueryDatabase, AuditLogsTable } from './kyselyDatabase'

export type AuditLogRow = Selectable<AuditLogsTable>
export type AuditLogInsert = Omit<Insertable<AuditLogsTable>, 'id'>

const SQLITE_INSERT_AUDIT_LOG = `
  INSERT INTO audit_logs (
    actor_user_id, actor_email, action, entity_type, entity_id, details, ip_address, user_agent, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`

export async function insertAuditLog(db: DatabaseClient, entry: AuditLogInsert): Promise<void> {
  if (db.backend !== 'postgres') {
    await db.run(SQLITE_INSERT_AUDIT_LOG, [
      entry.actor_user_id,
      entry.actor_email,
      entry.action,
      entry.entity_type,
      entry.entity_id,
      entry.details,
      entry.ip_address,
      entry.user_agent,
      entry.created_at
    ])
    return
  }

  const pool = (db as PostgresDb).getPool()
  await getQueryDatabase(pool)
    .insertInto('audit_logs')
    .values(entry)
    .execute()
}

const SQLITE_LIST_AUDIT_LOGS = `
  SELECT id, actor_user_id, actor_email, action, entity_type, entity_id, details, ip_address, user_agent, created_at
  FROM audit_logs
  ORDER BY datetime(created_at) DESC, id DESC
  LIMIT ?
`

export async function listAuditLogs(db: DatabaseClient, limit = 200): Promise<AuditLogRow[]> {
  if (db.backend !== 'postgres') {
    return db.all<AuditLogRow>(SQLITE_LIST_AUDIT_LOGS, [limit])
  }

  const pool = (db as PostgresDb).getPool()
  return getQueryDatabase(pool)
    .selectFrom('audit_logs')
    .select([
      'id', 'actor_user_id', 'actor_email', 'action', 'entity_type',
      'entity_id', 'details', 'ip_address', 'user_agent', 'created_at'
    ])
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limit)
    .execute()
}
