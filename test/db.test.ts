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
  it('migrates schema, seeds initial roadmaps and creates an env admin', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-db-'))
    process.chdir(tmp)
    process.env.ADMIN_EMAIL = 'ADMIN@EXAMPLE.COM'
    process.env.ADMIN_PASSWORD = 'ValidAdminPass123!'

    const { openDb } = await import('../lib/db')
    const db = await openDb()

    const roadmap = await db.get('SELECT title FROM roadmaps WHERE title = ?', ['Roadmap AWS gratuito para cantera junior DevOps'])
    const aiRoadmap = await db.get('SELECT title FROM roadmaps WHERE title = ?', ['Roadmap IA para SRE/DevOps - Versión 2.0'])
    const moduleCounts = await db.all(`
      SELECT roadmaps.title, COUNT(modules.id) AS count
      FROM roadmaps
      LEFT JOIN modules ON modules.roadmap_id = roadmaps.id
      GROUP BY roadmaps.id
    `)
    const admin = await db.get('SELECT email, role, is_active, password_hash FROM users WHERE email = ?', ['admin@example.com'])
    const auditColumns = await db.all('PRAGMA table_info(audit_logs)')
    const modulesByRoadmap = Object.fromEntries(moduleCounts.map((row: any) => [row.title, row.count]))

    expect(roadmap.title).toBe('Roadmap AWS gratuito para cantera junior DevOps')
    expect(aiRoadmap.title).toBe('Roadmap IA para SRE/DevOps - Versión 2.0')
    expect(modulesByRoadmap['Roadmap AWS gratuito para cantera junior DevOps']).toBe(11)
    expect(modulesByRoadmap['Roadmap IA para SRE/DevOps - Versión 2.0']).toBe(11)
    expect(admin.role).toBe('admin')
    expect(admin.is_active).toBe(1)
    expect(admin.password_hash).toMatch(/^scrypt:/)
    expect(auditColumns.map((column: any) => column.name)).toContain('action')

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

    const roadmapCount = await secondDb.get(
      'SELECT COUNT(*) AS count FROM roadmaps WHERE title = ?',
      ['Roadmap AWS gratuito para cantera junior DevOps']
    )
    const aiRoadmapCount = await secondDb.get(
      'SELECT COUNT(*) AS count FROM roadmaps WHERE title = ?',
      ['Roadmap IA para SRE/DevOps - Versión 2.0']
    )
    const adminCount = await secondDb.get('SELECT COUNT(*) AS count FROM users WHERE email = ?', ['admin@example.com'])

    expect(roadmapCount.count).toBe(1)
    expect(aiRoadmapCount.count).toBe(1)
    expect(adminCount.count).toBe(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ADMIN_PASSWORD ignored'))

    await secondDb.close()
  })
})
