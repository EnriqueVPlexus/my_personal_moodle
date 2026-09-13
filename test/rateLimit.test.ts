import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequest, createResponse } from './helpers/api'

const originalCwd = process.cwd()
let originalNodeEnv: string | undefined

beforeEach(() => {
  originalNodeEnv = process.env.NODE_ENV
  // The suite runs with NODE_ENV=test, which makes rateLimit a no-op by
  // design. Switch to a non-test value so the real database-backed logic
  // under test actually executes.
  process.env.NODE_ENV = 'development'
})

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv
  process.chdir(originalCwd)
})

describe('database-backed rate limiter', () => {
  async function setupDb() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-rate-limit-'))
    process.chdir(tmp)
    const { openDb } = await import('../lib/db')
    return openDb()
  }

  it('allows requests under the limit and blocks once exceeded', async () => {
    const db = await setupDb()
    const { rateLimit } = await import('../lib/rateLimit')
    const req = createRequest({ headers: { 'x-forwarded-for': '1.2.3.4' } })

    for (let attempt = 0; attempt < 3; attempt++) {
      const res = createResponse()
      const allowed = await rateLimit(db, req, res, { maxAttempts: 3, windowMs: 60_000, scope: 'test' })
      expect(allowed).toBe(true)
      expect(res.status).not.toHaveBeenCalled()
    }

    const blockedRes = createResponse()
    const blocked = await rateLimit(db, req, blockedRes, { maxAttempts: 3, windowMs: 60_000, scope: 'test' })
    expect(blocked).toBe(false)
    expect(blockedRes.status).toHaveBeenCalledWith(429)
    expect(blockedRes.json).toHaveBeenCalledWith({ error: 'too many attempts, please try again later' })
  })

  it('resets the counter after the window expires', async () => {
    const db = await setupDb()
    const { rateLimit } = await import('../lib/rateLimit')
    const req = createRequest({ headers: { 'x-forwarded-for': '5.6.7.8' } })

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = createResponse()
      expect(await rateLimit(db, req, res, { maxAttempts: 2, windowMs: 10, scope: 'test' })).toBe(true)
    }

    await new Promise(resolve => setTimeout(resolve, 20))

    const res = createResponse()
    expect(await rateLimit(db, req, res, { maxAttempts: 2, windowMs: 10, scope: 'test' })).toBe(true)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('keeps independent buckets per scope for the same IP', async () => {
    const db = await setupDb()
    const { rateLimit } = await import('../lib/rateLimit')
    const req = createRequest({ headers: { 'x-forwarded-for': '9.9.9.9' } })

    const loginRes = createResponse()
    expect(await rateLimit(db, req, loginRes, { maxAttempts: 1, windowMs: 60_000, scope: 'login' })).toBe(true)
    const loginBlockedRes = createResponse()
    expect(await rateLimit(db, req, loginBlockedRes, { maxAttempts: 1, windowMs: 60_000, scope: 'login' })).toBe(false)

    const setupRes = createResponse()
    expect(await rateLimit(db, req, setupRes, { maxAttempts: 1, windowMs: 60_000, scope: 'setup' })).toBe(true)
  })

  it('clearRateLimit removes the bucket so the next attempt starts fresh', async () => {
    const db = await setupDb()
    const { rateLimit, clearRateLimit } = await import('../lib/rateLimit')
    const req = createRequest({ headers: { 'x-forwarded-for': '10.10.10.10' } })

    const res1 = createResponse()
    expect(await rateLimit(db, req, res1, { maxAttempts: 1, windowMs: 60_000, scope: 'login' })).toBe(true)
    const blockedRes = createResponse()
    expect(await rateLimit(db, req, blockedRes, { maxAttempts: 1, windowMs: 60_000, scope: 'login' })).toBe(false)

    await clearRateLimit(db, req, 'login')

    const res2 = createResponse()
    expect(await rateLimit(db, req, res2, { maxAttempts: 1, windowMs: 60_000, scope: 'login' })).toBe(true)
  })

  it('falls back to the socket remote address when there is no forwarded-for header', async () => {
    const db = await setupDb()
    const { rateLimit } = await import('../lib/rateLimit')
    const req = createRequest({ headers: {}, socket: { remoteAddress: '127.0.0.1' } })

    const res = createResponse()
    expect(await rateLimit(db, req, res, { maxAttempts: 5, windowMs: 60_000, scope: 'test' })).toBe(true)
  })
})
