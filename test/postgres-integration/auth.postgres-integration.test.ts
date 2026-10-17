import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'
import { PostgresDb } from '../../lib/postgresDb'
import { createSession, clearSession, getUserFromRequest } from '../../lib/auth'

/**
 * Verifies lib/auth.ts session lifecycle (create/lookup/expiry/clear) against
 * a real Postgres instance (backlog.md: "Tests de integracion contra
 * PostgreSQL real" - dominio auth). auth.ts has no separate Postgres SQL
 * branch (it uses the generic DatabaseClient interface), but its raw SQL
 * relies on real TIMESTAMPTZ comparison semantics (`expires_at > ?`) that a
 * mocked pg pool cannot validate.
 *
 * Requires DATABASE_URL (or TEST_DATABASE_URL, which takes precedence and
 * should point at the isolated local Docker Postgres from
 * docker-compose.test.yml - see test/postgres-integration/README.md).
 * Skipped entirely otherwise so `vitest run` stays green without one.
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeIfPostgres = DATABASE_URL ? describe : describe.skip

function fakeRes() {
  const headers: Record<string, string> = {}
  return {
    setHeader: (name: string, value: string) => { headers[name] = value },
    getHeaders: () => headers
  } as unknown as NextApiResponse & { getHeaders: () => Record<string, string> }
}

function fakeReq(cookie: string | undefined): NextApiRequest {
  return { headers: { cookie } } as unknown as NextApiRequest
}

function extractSessionCookieValue(setCookieHeader: string) {
  const match = /moodle_session=([^;]*)/.exec(setCookieHeader)
  return match ? match[1] : ''
}

describeIfPostgres('auth session lifecycle (real postgres)', () => {
  let db: PostgresDb
  let userId: number

  const marker = `pg-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const testEmail = `${marker}@example.com`

  beforeAll(async () => {
    db = new PostgresDb(DATABASE_URL as string)
    await db.migrate()

    userId = (await db.run(
      'INSERT INTO users (email, name, role, password_hash, is_active) VALUES (?, ?, ?, ?, ?)',
      [testEmail, marker, 'user', 'not-a-real-hash', 1]
    )).lastID as number
  })

  afterAll(async () => {
    if (userId) await db.run('DELETE FROM users WHERE id = ?', [userId])
    await db.close()
  })

  it('creates a session and resolves it back to the user via the join + expiry filter', async () => {
    const res = fakeRes()
    await createSession(res, userId, db)

    const setCookie = res.getHeaders()['Set-Cookie']
    expect(setCookie).toBeTruthy()
    const token = extractSessionCookieValue(setCookie)
    expect(token).not.toBe('')

    const req = fakeReq(`moodle_session=${token}`)
    const user = await getUserFromRequest(req, db)

    expect(user).not.toBeNull()
    expect(user?.email).toBe(testEmail)
    expect(user?.role).toBe('user')
  })

  it('does not resolve a session whose expires_at is in the past (TIMESTAMPTZ comparison)', async () => {
    const res = fakeRes()
    await createSession(res, userId, db)
    const token = extractSessionCookieValue(res.getHeaders()['Set-Cookie'])

    const crypto = await import('crypto')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const pastIso = new Date(Date.now() - 60_000).toISOString()
    await db.run('UPDATE sessions SET expires_at = ? WHERE token_hash = ?', [pastIso, tokenHash])

    const req = fakeReq(`moodle_session=${token}`)
    const user = await getUserFromRequest(req, db)

    expect(user).toBeNull()
  })

  it('deletes sessions whose expires_at is already <= now when a new session is created', async () => {
    const crypto = await import('crypto')
    const staleToken = 'stale-token-for-cleanup-test'
    const staleHash = crypto.createHash('sha256').update(staleToken).digest('hex')
    const pastIso = new Date(Date.now() - 60_000).toISOString()
    const nowIso = new Date().toISOString()

    await db.run(
      'INSERT INTO sessions (user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
      [userId, staleHash, pastIso, nowIso, nowIso]
    )

    const res = fakeRes()
    await createSession(res, userId, db)

    const staleRow = await db.get('SELECT id FROM sessions WHERE token_hash = ?', [staleHash])
    expect(staleRow).toBeUndefined()
  })

  it('clearSession deletes the session so the token no longer resolves', async () => {
    const res = fakeRes()
    await createSession(res, userId, db)
    const token = extractSessionCookieValue(res.getHeaders()['Set-Cookie'])

    const req = fakeReq(`moodle_session=${token}`)
    const clearRes = fakeRes()
    await clearSession(req, clearRes, db)

    const user = await getUserFromRequest(req, db)
    expect(user).toBeNull()
  })
})
