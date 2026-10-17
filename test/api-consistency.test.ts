import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequest, createResponse } from './helpers/api'

/**
 * End-to-end handler checks against a real temporary SQLite database for the
 * API consistency rules: Spanish 401/403/405 messages, JSON 405 with `Allow`,
 * idempotent roadmap deletion and one user shape for every PATCH action.
 */
const originalCwd = process.cwd()
const SECRET_KEYS = ['password_hash', 'token', 'token_hash', 'password']

let db: any
let adminCookie: string
let userCookie: string
let adminId: number
let userId: number
let roadmapId: number

async function session(id: number) {
  const { createAuthService } = await import('../lib/domains/auth')
  const { token } = await createAuthService(db).startSession(id)
  return { cookie: `moodle_session=${token}` }
}

async function call(route: string, options: Record<string, any>) {
  const handler = (await import(route)).default
  const res = createResponse()
  await handler(createRequest(options), res)
  return res
}

beforeEach(async () => {
  vi.resetModules()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-api-consistency-'))
  process.chdir(tmp)
  const { openDb } = await import('../lib/persistence')
  db = await openDb()
  const now = new Date().toISOString()
  adminId = (await db.run(
    "INSERT INTO users (email, name, role, password_hash, created_at, updated_at) VALUES ('boss@example.com', 'Boss', 'admin', 'x', ?, ?)",
    [now, now]
  )).lastID
  userId = (await db.run(
    "INSERT INTO users (email, name, role, password_hash, can_view_all_roadmaps, created_at, updated_at) VALUES ('ana@example.com', 'Ana', 'user', 'x', 0, ?, ?)",
    [now, now]
  )).lastID
  roadmapId = (await db.run('INSERT INTO roadmaps (title) VALUES (?)', ['Roadmap de prueba'])).lastID
  adminCookie = (await session(adminId)).cookie
  userCookie = (await session(userId)).cookie
})

afterEach(() => {
  process.chdir(originalCwd)
  vi.resetModules()
})

async function auditActions() {
  return (await db.all('SELECT action FROM audit_logs ORDER BY id')).map((row: any) => row.action)
}

describe('Spanish auth errors', () => {
  it('answers 401 without a session and 403 for a non-admin', async () => {
    const anonymous = await call('../pages/api/admin/dashboard', { method: 'GET' })
    expect(anonymous.statusCode).toBe(401)
    expect(anonymous.body).toEqual({ error: 'Debes iniciar sesión.' })

    const student = await call('../pages/api/admin/dashboard', { method: 'GET', headers: { cookie: userCookie } })
    expect(student.statusCode).toBe(403)
    expect(student.body).toEqual({ error: 'Necesitas permisos de administrador.' })
  })

  it('answers the origin errors in Spanish', async () => {
    const res = await call('../pages/api/roadmaps/[id]', {
      method: 'DELETE',
      query: { id: String(roadmapId) },
      headers: { cookie: adminCookie, origin: 'https://evil.example', host: 'localhost:3000' }
    })
    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'Origen de la petición no permitido.' })
  })

  it('answers the setup token and invalid credentials errors in Spanish', async () => {
    const login = await call('../pages/api/auth/login', {
      method: 'POST',
      body: { email: 'ana@example.com', password: 'incorrecta-123' }
    })
    expect(login.statusCode).toBe(401)
    expect(login.body).toEqual({ error: 'Credenciales no válidas.' })

    vi.stubEnv('AUTH_SETUP_TOKEN', 'secreto')
    const setup = await call('../pages/api/auth/setup', {
      method: 'POST',
      body: { setupToken: 'otro', email: 'x@example.com', password: 'una-clave-larga-123' }
    })
    vi.unstubAllEnvs()
    expect(setup.statusCode).toBe(403)
    expect(setup.body).toEqual({ error: 'Se requiere el token de configuración inicial.' })
  })
})

describe('405 uses the JSON error contract', () => {
  it.each([
    ['../pages/api/auth/me', 'GET'],
    ['../pages/api/auth/login', 'POST'],
    ['../pages/api/roadmaps/[id]', 'GET, PUT, DELETE'],
    ['../pages/api/roadmaps/index', 'GET, POST'],
    ['../pages/api/users/[id]', 'PATCH'],
    ['../pages/api/lessons/index', 'GET, POST'],
    ['../pages/api/openapi.json', 'GET']
  ])('%s keeps the Allow header and a JSON body', async (route, allow) => {
    const res = await call(route, { method: 'TRACE', query: { id: '1' } })
    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe(allow)
    expect(res.body).toEqual({ error: 'Método no permitido.' })
  })
})

describe('DELETE /api/roadmaps/{id}', () => {
  it('answers 204 without body and audits when the roadmap existed', async () => {
    const res = await call('../pages/api/roadmaps/[id]', {
      method: 'DELETE', query: { id: String(roadmapId) }, headers: { cookie: adminCookie }
    })
    expect(res.statusCode).toBe(204)
    expect(res.body).toBeUndefined()
    expect(await db.get('SELECT id FROM roadmaps WHERE id = ?', [roadmapId])).toBeUndefined()
    expect(await auditActions()).toEqual(['roadmap.delete'])
  })

  it('answers 200 with a message and does not audit when it did not exist; repeating is safe', async () => {
    const first = await call('../pages/api/roadmaps/[id]', {
      method: 'DELETE', query: { id: '9999' }, headers: { cookie: adminCookie }
    })
    expect(first.statusCode).toBe(200)
    expect(first.body).toEqual({ message: 'El roadmap no existía; no había nada que borrar.' })

    await call('../pages/api/roadmaps/[id]', { method: 'DELETE', query: { id: String(roadmapId) }, headers: { cookie: adminCookie } })
    const again = await call('../pages/api/roadmaps/[id]', {
      method: 'DELETE', query: { id: String(roadmapId) }, headers: { cookie: adminCookie }
    })
    expect(again.statusCode).toBe(200)
    expect(again.body).toEqual({ message: 'El roadmap no existía; no había nada que borrar.' })
    expect(await auditActions()).toEqual(['roadmap.delete'])
  })
})

describe('PATCH /api/users/{id}', () => {
  it('returns the same user shape for every action, without secrets', async () => {
    const patch = (body: Record<string, unknown>) => call('../pages/api/users/[id]', {
      method: 'PATCH', query: { id: String(userId) }, headers: { cookie: adminCookie }, body
    })

    const responses = [
      await patch({ action: 'set_roadmap_access', can_view_all_roadmaps: false, roadmap_ids: [roadmapId] }),
      await patch({ action: 'reset_password', password: 'una-clave-larga-123' }),
      await patch({ action: 'set_active', is_active: false })
    ]

    for (const res of responses) {
      expect(res.statusCode).toBe(200)
      for (const secret of SECRET_KEYS) expect(res.body).not.toHaveProperty(secret)
      expect(res.body).toMatchObject({ id: userId, email: 'ana@example.com', roadmap_access_ids: [roadmapId] })
    }

    const keys = responses.map(res => Object.keys(res.body).sort())
    expect(keys[1]).toEqual(keys[0])
    expect(keys[2]).toEqual(keys[0])
    expect(keys[0]).toEqual(expect.arrayContaining(['can_view_all_roadmaps', 'roadmap_access_ids']))
  })
})

describe('POST /api/users', () => {
  it('returns the same user shape as PATCH and the list, without secrets', async () => {
    const created = await call('../pages/api/users/index', {
      method: 'POST',
      headers: { cookie: adminCookie },
      body: { email: 'nuevo@example.com', name: 'Nuevo', password: 'una-clave-larga-123' }
    })
    expect(created.statusCode).toBe(201)
    for (const secret of SECRET_KEYS) expect(created.body).not.toHaveProperty(secret)
    expect(created.body).toMatchObject({ email: 'nuevo@example.com', role: 'user', roadmap_access_ids: [] })

    const patched = await call('../pages/api/users/[id]', {
      method: 'PATCH',
      query: { id: String(created.body.id) },
      headers: { cookie: adminCookie },
      body: { action: 'set_active', is_active: true }
    })
    const listed = await call('../pages/api/users/index', { method: 'GET', headers: { cookie: adminCookie } })
    const listedUser = listed.body.find((account: any) => account.id === created.body.id)

    expect(Object.keys(created.body).sort()).toEqual(Object.keys(patched.body).sort())
    expect(Object.keys(created.body).sort()).toEqual(Object.keys(listedUser).sort())
  })
})
