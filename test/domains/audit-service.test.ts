import { describe, expect, it } from 'vitest'
import { makeAuditService } from '../../lib/domains/audit/service'
import type { AuditLogRepository } from '../../lib/domains/audit/ports'
import type { AuditLogEntry, NewAuditLogEntry } from '../../lib/domains/audit/types'

function fakeRepository() {
  const rows: AuditLogEntry[] = []
  const repository: AuditLogRepository = {
    async insert(entry: NewAuditLogEntry) {
      rows.push({ id: rows.length + 1, ...entry })
    },
    async list(limit: number) {
      return rows.slice().reverse().slice(0, limit)
    }
  }
  return { rows, repository }
}

const fixedNow = () => new Date('2026-01-02T03:04:05.000Z')

describe('audit service', () => {
  it('maps an event and a plain context to a persisted entry', async () => {
    const { rows, repository } = fakeRepository()
    const service = makeAuditService(repository, fixedNow)

    await service.record(
      {
        actor: { id: 1, email: 'admin@example.com' },
        action: 'user.create',
        entityType: 'user',
        entityId: 2,
        details: { email: 'user@example.com' }
      },
      { ip: '10.0.0.1', userAgent: 'vitest' }
    )

    expect(rows[0]).toEqual({
      id: 1,
      actor_user_id: 1,
      actor_email: 'admin@example.com',
      action: 'user.create',
      entity_type: 'user',
      entity_id: '2',
      details: JSON.stringify({ email: 'user@example.com' }),
      ip_address: '10.0.0.1',
      user_agent: 'vitest',
      created_at: '2026-01-02T03:04:05.000Z'
    })
  })

  it('stores anonymous events with null defaults', async () => {
    const { rows, repository } = fakeRepository()
    const service = makeAuditService(repository, fixedNow)

    await service.record({ action: 'roadmap.read', entityType: 'roadmap' }, { ip: null, userAgent: null })

    expect(rows[0]).toMatchObject({
      actor_user_id: null,
      actor_email: null,
      entity_id: null,
      details: null,
      ip_address: null,
      user_agent: null
    })
  })

  it('lists entries newest first with a default limit of 200', async () => {
    const { repository } = fakeRepository()
    const service = makeAuditService(repository, fixedNow)
    await service.record({ action: 'a', entityType: 'x' }, { ip: null, userAgent: null })
    await service.record({ action: 'b', entityType: 'x' }, { ip: null, userAgent: null })

    expect((await service.list()).map(row => row.action)).toEqual(['b', 'a'])
    expect(await service.list(1)).toHaveLength(1)
  })
})
