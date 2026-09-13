import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
const connectMock = vi.fn()
const endMock = vi.fn()

vi.mock('pg', () => {
  class FakePool {
    query = queryMock
    connect = connectMock
    end = endMock
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
    const { PostgresDb } = await import('../lib/postgresDb')
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1, email: 'a@b.com' }], rowCount: 1 })

    const db = new PostgresDb('postgres://fake')
    const row = await db.get('SELECT * FROM users WHERE id = ? AND email = ?', [1, 'a@b.com'])

    expect(row).toEqual({ id: 1, email: 'a@b.com' })
    expect(queryMock).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1 AND email = $2', [1, 'a@b.com'])
  })

  it('all() returns every row', async () => {
    const { PostgresDb } = await import('../lib/postgresDb')
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2 })

    const db = new PostgresDb('postgres://fake')
    const rows = await db.all('SELECT * FROM roadmaps')

    expect(rows).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('throws on a SQL parameter count mismatch', async () => {
    const { PostgresDb } = await import('../lib/postgresDb')
    const db = new PostgresDb('postgres://fake')

    await expect(db.get('SELECT * FROM users WHERE id = ?', [])).rejects.toThrow(
      'SQL parameter count mismatch: expected 1, received 0'
    )
  })

  describe('run()', () => {
    it('appends RETURNING id for an INSERT into an id-generating table without one', async () => {
      const { PostgresDb } = await import('../lib/postgresDb')
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
      const { PostgresDb } = await import('../lib/postgresDb')
      queryMock.mockResolvedValueOnce({ rows: [{ id: 7 }], rowCount: 1 })

      const db = new PostgresDb('postgres://fake')
      await db.run('INSERT INTO users (email) VALUES (?) RETURNING id', ['a@b.com'])

      const calledSql = queryMock.mock.calls[0][0] as string
      expect(calledSql.match(/RETURNING id/gi)).toHaveLength(1)
    })

    it('does not request lastID for updates/deletes or non-id tables', async () => {
      const { PostgresDb } = await import('../lib/postgresDb')
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 3 })

      const db = new PostgresDb('postgres://fake')
      const result = await db.run('UPDATE users SET is_active = ? WHERE id = ?', [0, 1])

      expect(result).toEqual({ changes: 3, lastID: undefined })
      expect(queryMock.mock.calls[0][0]).not.toContain('RETURNING')
    })

    it('translates INSERT OR IGNORE INTO into ON CONFLICT DO NOTHING', async () => {
      const { PostgresDb } = await import('../lib/postgresDb')
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 })

      const db = new PostgresDb('postgres://fake')
      await db.run('INSERT OR IGNORE INTO user_roadmap_access (user_id, roadmap_id) VALUES (?, ?)', [1, 2])

      const calledSql = queryMock.mock.calls[0][0] as string
      expect(calledSql).toContain('INSERT INTO user_roadmap_access')
      expect(calledSql).toContain('ON CONFLICT DO NOTHING')
      expect(calledSql).not.toContain('OR IGNORE')
    })
  })

  describe('exec() transaction handling', () => {
    it('BEGIN opens a dedicated client and routes subsequent queries through it', async () => {
      const { PostgresDb } = await import('../lib/postgresDb')
      const client = fakeClient()
      connectMock.mockResolvedValueOnce(client)

      const db = new PostgresDb('postgres://fake')
      await db.exec('BEGIN IMMEDIATE')

      expect(connectMock).toHaveBeenCalled()
      expect(client.query).toHaveBeenCalledWith('BEGIN')

      client.query.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 })
      await db.get('SELECT 1')
      expect(client.query).toHaveBeenCalledWith('SELECT 1', [])
      expect(queryMock).not.toHaveBeenCalled()
    })

    it('COMMIT releases the transaction client', async () => {
      const { PostgresDb } = await import('../lib/postgresDb')
      const client = fakeClient()
      connectMock.mockResolvedValueOnce(client)

      const db = new PostgresDb('postgres://fake')
      await db.exec('BEGIN')
      await db.exec('COMMIT')

      expect(client.query).toHaveBeenCalledWith('COMMIT')
      expect(client.release).toHaveBeenCalled()
    })

    it('COMMIT without an open transaction is a no-op', async () => {
      const { PostgresDb } = await import('../lib/postgresDb')
      const db = new PostgresDb('postgres://fake')

      await db.exec('COMMIT')

      expect(connectMock).not.toHaveBeenCalled()
    })

    it('ROLLBACK releases the transaction client', async () => {
      const { PostgresDb } = await import('../lib/postgresDb')
      const client = fakeClient()
      connectMock.mockResolvedValueOnce(client)

      const db = new PostgresDb('postgres://fake')
      await db.exec('BEGIN')
      await db.exec('ROLLBACK')

      expect(client.query).toHaveBeenCalledWith('ROLLBACK')
      expect(client.release).toHaveBeenCalled()
    })

    it('ROLLBACK without an open transaction is a no-op', async () => {
      const { PostgresDb } = await import('../lib/postgresDb')
      const db = new PostgresDb('postgres://fake')

      await db.exec('ROLLBACK')

      expect(connectMock).not.toHaveBeenCalled()
    })

    it('other statements go straight to the pool', async () => {
      const { PostgresDb } = await import('../lib/postgresDb')
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 })

      const db = new PostgresDb('postgres://fake')
      await db.exec('CREATE TABLE IF NOT EXISTS foo (id INT)')

      expect(queryMock).toHaveBeenCalled()
    })
  })

  it('migrate() runs the schema against the pool', async () => {
    const { PostgresDb } = await import('../lib/postgresDb')
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 })

    const db = new PostgresDb('postgres://fake')
    await db.migrate()

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS roadmaps'))
  })

  it('getPool() exposes the underlying pool', async () => {
    const { PostgresDb } = await import('../lib/postgresDb')
    const db = new PostgresDb('postgres://fake')
    expect(db.getPool()).toBeDefined()
  })

  describe('close()', () => {
    it('releases an open transaction client before ending the pool', async () => {
      const { PostgresDb } = await import('../lib/postgresDb')
      const client = fakeClient()
      connectMock.mockResolvedValueOnce(client)

      const db = new PostgresDb('postgres://fake')
      await db.exec('BEGIN')
      await db.close()

      expect(client.release).toHaveBeenCalled()
      expect(endMock).toHaveBeenCalled()
    })

    it('ends the pool directly when there is no open transaction', async () => {
      const { PostgresDb } = await import('../lib/postgresDb')
      const db = new PostgresDb('postgres://fake')

      await db.close()

      expect(endMock).toHaveBeenCalled()
    })
  })
})
