import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const originalCwd = process.cwd()

afterEach(() => {
  process.chdir(originalCwd)
  vi.resetModules()
  delete process.env.ADMIN_EMAIL
  delete process.env.ADMIN_PASSWORD
})

describe('SQLite database bootstrap', () => {
  it('migrates schema, seeds the bundled roadmaps and creates an env admin', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-db-'))
    process.chdir(tmp)
    process.env.ADMIN_EMAIL = 'ADMIN@EXAMPLE.COM'
    process.env.ADMIN_PASSWORD = 'ValidAdminPass123!'

    const { openDb } = await import('../lib/db')
    const db = await openDb()

    const awsRoadmap = await db.get('SELECT id, title FROM roadmaps WHERE title = ?', [
      'Roadmap AWS gratuito para cantera junior DevOps'
    ])
    const devopsRoadmap = await db.get('SELECT id, title FROM roadmaps WHERE title = ?', [
      'Roadmap desde 0 a DevOps Junior'
    ])
    const awsModuleCount = await db.get('SELECT COUNT(*) AS count FROM modules WHERE roadmap_id = ?', [awsRoadmap.id])
    const devopsModuleCount = await db.get('SELECT COUNT(*) AS count FROM modules WHERE roadmap_id = ?', [
      devopsRoadmap.id
    ])
    const admin = await db.get('SELECT email, role, is_active, password_hash FROM users WHERE email = ?', ['admin@example.com'])
    const auditColumns = await db.all('PRAGMA table_info(audit_logs)')
    const userColumns = await db.all('PRAGMA table_info(users)')
    const accessColumns = await db.all('PRAGMA table_info(user_roadmap_access)')

    expect(awsRoadmap.title).toBe('Roadmap AWS gratuito para cantera junior DevOps')
    expect(devopsRoadmap.title).toBe('Roadmap desde 0 a DevOps Junior')
    expect(awsModuleCount.count).toBe(11)
    expect(devopsModuleCount.count).toBe(12)
    expect(admin.role).toBe('admin')
    expect(admin.is_active).toBe(1)
    expect(admin.password_hash).toMatch(/^scrypt:/)
    expect(auditColumns.map((column: any) => column.name)).toContain('action')
    expect(userColumns.map((column: any) => column.name)).toContain('can_view_all_roadmaps')
    expect(accessColumns.map((column: any) => column.name)).toEqual(expect.arrayContaining(['user_id', 'roadmap_id']))

    await db.close()
  })

  it('updates existing seed rows idempotently and ignores weak env admin passwords', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-db-'))
    process.chdir(tmp)
    process.env.ADMIN_EMAIL = 'admin@example.com'
    process.env.ADMIN_PASSWORD = 'ValidAdminPass123!'

    const firstImport = await import('../lib/db')
    const firstDb = await firstImport.openDb()
    await firstDb.close()

    vi.resetModules()
    process.env.ADMIN_PASSWORD = 'short'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const secondImport = await import('../lib/db')
    const secondDb = await secondImport.openDb()

    const awsRoadmapCount = await secondDb.get(
      'SELECT COUNT(*) AS count FROM roadmaps WHERE title = ?',
      ['Roadmap AWS gratuito para cantera junior DevOps']
    )
    const devopsRoadmapCount = await secondDb.get('SELECT COUNT(*) AS count FROM roadmaps WHERE title = ?', [
      'Roadmap desde 0 a DevOps Junior'
    ])
    const adminCount = await secondDb.get('SELECT COUNT(*) AS count FROM users WHERE email = ?', ['admin@example.com'])

    expect(awsRoadmapCount.count).toBe(1)
    expect(devopsRoadmapCount.count).toBe(1)
    expect(adminCount.count).toBe(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ADMIN_PASSWORD ignored'))

    await secondDb.close()
  })
})
