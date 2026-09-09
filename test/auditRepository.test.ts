import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const originalCwd = process.cwd()

afterEach(async () => {
  process.chdir(originalCwd)
  vi.resetModules()
})

describe('audit log repository', () => {
  it('inserts and lists audit logs over the SQLite compatibility path', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-audit-repo-'))
    process.chdir(tmp)

    const { openDb } = await import('../lib/db')
    const { insertAuditLog, listAuditLogs } = await import('../lib/auditRepository')
    const db = await openDb()

    await insertAuditLog(db, {
      actor_user_id: null,
      actor_email: 'admin@example.com',
      action: 'roadmap.update',
      entity_type: 'roadmap',
      entity_id: '1',
      details: JSON.stringify({ title: 'Test' }),
      ip_address: '127.0.0.1',
      user_agent: 'vitest',
      created_at: new Date().toISOString()
    })

    const rows = await listAuditLogs(db, 10)

    expect(rows[0]).toMatchObject({
      actor_email: 'admin@example.com',
      action: 'roadmap.update',
      entity_type: 'roadmap',
      entity_id: '1'
    })

    await db.close()
  })

  it('limits the number of returned rows', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-audit-repo-limit-'))
    process.chdir(tmp)

    const { openDb } = await import('../lib/db')
    const { insertAuditLog, listAuditLogs } = await import('../lib/auditRepository')
    const db = await openDb()

    for (let i = 0; i < 3; i += 1) {
      await insertAuditLog(db, {
        actor_user_id: null,
        actor_email: null,
        action: `action.${i}`,
        entity_type: 'test',
        entity_id: null,
        details: null,
        ip_address: null,
        user_agent: null,
        created_at: new Date().toISOString()
      })
    }

    const rows = await listAuditLogs(db, 2)

    expect(rows).toHaveLength(2)

    await db.close()
  })
})
