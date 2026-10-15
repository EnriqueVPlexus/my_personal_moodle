import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
const connectMock = vi.fn()
const endMock = vi.fn()

vi.mock('pg', () => {
  class FakePool {
    query = queryMock
    connect = connectMock
    end = endMock
    on = vi.fn()
  }
  return { Pool: FakePool }
})

function fakeClient() {
  return { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }), release: vi.fn() }
}

describe('PostgresDb', () => {
  beforeEach(() => {
    queryMock.mockReset()
    connectMock.mockReset()
    endMock.mockReset()
  })

  it('get() returns the first row and translates ? placeholders to $n', async () => {
    const { PostgresDb } = await import('../lib/persistence/postgresDb')
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1, email: 'a@b.com' }], rowCount: 1 })

    const db = new PostgresDb('postgres://fake')
    const row = await db.get('SELECT * FROM users WHERE id = ? AND email = ?', [1, 'a@b.com'])

    expect(row).toEqual({ id: 1, email: 'a@b.com' })
    expect(queryMock).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1 AND email = $2', [1, 'a@b.com'])
  })

  it('all() returns every row', async () => {
    const { PostgresDb } = await import('../lib/persistence/postgresDb')
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2 })

    const db = new PostgresDb('postgres://fake')
    const rows = await db.all('SELECT * FROM roadmaps')

    expect(rows).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('throws on a SQL parameter count mismatch', async () => {
    const { PostgresDb } = await import('../lib/persistence/postgresDb')
    const db = new PostgresDb('postgres://fake')

    await expect(db.get('SELECT * FROM users WHERE id = ?', [])).rejects.toThrow(
      'SQL parameter count mismatch: expected 1, received 0'
    )
  })

  describe('run()', () => {
    it('appends RETURNING id for an INSERT into an id-generating table without one', async () => {
      const { PostgresDb } = await import('../lib/persistence/postgresDb')
      queryMock.mockResolvedValueOnce({ rows: [{ id: 42 }], rowCount: 1 })

      const db = new PostgresDb('postgres://fake')
      const result = await db.run('INSERT INTO users (email) VALUES (?)', ['a@b.com'])

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('RETURNING id'),
        ['a@b.com']
      )
      expect(result).toEqual({ changes: 1, lastID: 42 })
    })

    it('does not duplicate RETURNING when the query already has one', async () => {
      const { PostgresDb } = await import('../lib/persistence/postgresDb')
      queryMock.mockResolvedValueOnce({ rows: [{ id: 7 }], rowCount: 1 })

      const db = new PostgresDb('postgres://fake')
      await db.run('INSERT INTO users (email) VALUES (?) RETURNING id', ['a@b.com'])

      const calledSql = queryMock.mock.calls[0][0] as string
      expect(calledSql.match(/RETURNING id/gi)).toHaveLength(1)
    })

    it('does not request lastID for updates/deletes or non-id tables', async () => {
      const { PostgresDb } = await import('../lib/persistence/postgresDb')
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 3 })

      const db = new PostgresDb('postgres://fake')
      const result = await db.run('UPDATE users SET is_active = ? WHERE id = ?', [0, 1])

      expect(result).toEqual({ changes: 3, lastID: undefined })
      expect(queryMock.mock.calls[0][0]).not.toContain('RETURNING')
    })

    it('translates INSERT OR IGNORE INTO into ON CONFLICT DO NOTHING', async () => {
      const { PostgresDb } = await import('../lib/persistence/postgresDb')
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 })

      const db = new PostgresDb('postgres://fake')
      await db.run('INSERT OR IGNORE INTO user_roadmap_access (user_id, roadmap_id) VALUES (?, ?)', [1, 2])

      const calledSql = queryMock.mock.calls[0][0] as string
      expect(calledSql).toContain('INSERT INTO user_roadmap_access')
      expect(calledSql).toContain('ON CONFLICT DO NOTHING')
      expect(calledSql).not.toContain('OR IGNORE')
    })
  })

  describe('transaction()', () => {
    async function open() {
      const { PostgresDb } = await import('../lib/persistence/postgresDb')
      const client = fakeClient()
      connectMock.mockResolvedValueOnce(client)
      return { db: new PostgresDb('postgres://fake'), client }
    }

    it('checks out one client, routes every statement through it and commits', async () => {
      const { db, client } = await open()

      const result = await db.transaction(async tx => {
        client.query.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 })
        const row = await tx.get('SELECT 1')
        await tx.run('UPDATE users SET name = ? WHERE id = ?', ['a', 1])
        return row
      })

      expect(result).toEqual({ id: 1 })
      expect(client.query.mock.calls.map(call => call[0])).toEqual([
        'BEGIN', 'SELECT 1', 'UPDATE users SET name = $1 WHERE id = $2', 'COMMIT'
      ])
      expect(connectMock).toHaveBeenCalledTimes(1)
      expect(queryMock).not.toHaveBeenCalled()
      expect(client.release).toHaveBeenCalledWith(false)
    })

    it('rolls back, releases the client and rethrows the original error', async () => {
      const { db, client } = await open()
      const failure = new Error('boom')

      await expect(db.transaction(async () => { throw failure })).rejects.toBe(failure)

      expect(client.query.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'ROLLBACK'])
      expect(client.release).toHaveBeenCalledWith(false)
    })

    it('logs a failing ROLLBACK without masking the original error and discards the client', async () => {
      const { db, client } = await open()
      const failure = new Error('boom')
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      client.query.mockImplementation(async (sql: string) => {
        if (sql === 'ROLLBACK') throw new Error('rollback failed')
        return { rows: [], rowCount: 0 }
      })

      await expect(db.transaction(async () => { throw failure })).rejects.toBe(failure)

      expect(consoleError).toHaveBeenCalledWith('Transaction rollback failed', expect.any(Error))
      expect(client.release).toHaveBeenCalledWith(true)
      consoleError.mockRestore()
    })

    it('rolls back when COMMIT fails', async () => {
      const { db, client } = await open()
      client.query.mockImplementation(async (sql: string) => {
        if (sql === 'COMMIT') throw new Error('commit failed')
        return { rows: [], rowCount: 0 }
      })

      await expect(db.transaction(async () => 'ok')).rejects.toThrow('commit failed')
      expect(client.query).toHaveBeenCalledWith('ROLLBACK')
      expect(client.release).toHaveBeenCalled()
    })

    it('rejects nested transactions and use of the tx client after it finished', async () => {
      const { NestedTransactionError, TransactionClosedError } = await import('../lib/persistence/transaction')
      const { db } = await open()
      let leaked: any

      await expect(db.transaction(async tx => {
        leaked = tx
        await tx.transaction(async () => 'inner')
      })).rejects.toBeInstanceOf(NestedTransactionError)

      await expect(leaked.get('SELECT 1')).rejects.toBeInstanceOf(TransactionClosedError)
    })

    it('exposes a pool facade on the tx client that always yields the transaction client', async () => {
      const { db, client } = await open()

      await db.transaction(async tx => {
        const facade = (tx as any).getPool()
        const first = await facade.connect()
        const second = await facade.connect()
        await first.query('SELECT 1')
        first.release()
        expect(second).toBe(first)
      })

      expect(client.query).toHaveBeenCalledWith('SELECT 1')
      expect(client.release).toHaveBeenCalledTimes(1)
    })

    it('refuses hand-written transaction control statements through exec()', async () => {
      const { PostgresDb } = await import('../lib/persistence/postgresDb')
      const db = new PostgresDb('postgres://fake')

      await expect(db.exec('BEGIN')).rejects.toThrow('db.transaction()')
      await expect(db.exec('COMMIT')).rejects.toThrow('db.transaction()')
      await expect(db.exec('rollback')).rejects.toThrow('db.transaction()')
      expect(connectMock).not.toHaveBeenCalled()
    })

    it('other statements go straight to the pool', async () => {
      const { PostgresDb } = await import('../lib/persistence/postgresDb')
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 })

      const db = new PostgresDb('postgres://fake')
      await db.exec('CREATE TABLE IF NOT EXISTS foo (id INT)')

      expect(queryMock).toHaveBeenCalled()
    })
  })

  it('migrate() runs the schema against the pool', async () => {
    const { PostgresDb } = await import('../lib/persistence/postgresDb')
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 })

    const db = new PostgresDb('postgres://fake')
    await db.migrate()

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS roadmaps'))
  })

  it('getPool() exposes the underlying pool', async () => {
    const { PostgresDb } = await import('../lib/persistence/postgresDb')
    const db = new PostgresDb('postgres://fake')
    expect(db.getPool()).toBeDefined()
  })

  describe('close()', () => {
    it('ends the pool', async () => {
      const { PostgresDb } = await import('../lib/persistence/postgresDb')
      const db = new PostgresDb('postgres://fake')

      await db.close()

      expect(endMock).toHaveBeenCalled()
    })
  })
})
