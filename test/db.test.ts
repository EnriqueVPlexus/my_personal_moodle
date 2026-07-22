import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'

const originalCwd = process.cwd()

afterEach(() => {
  process.chdir(originalCwd)
  vi.resetModules()
  delete process.env.ADMIN_EMAIL
  delete process.env.ADMIN_PASSWORD
})

describe('SQLite database bootstrap', () => {
  it('upgrades a legacy catalog without losing existing roadmaps', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-db-legacy-'))
    const dataDir = path.join(tmp, 'data')
    fs.mkdirSync(dataDir)
    const legacyDb = await open({ filename: path.join(dataDir, 'dev.db'), driver: sqlite3.Database })
    await legacyDb.exec(`
      CREATE TABLE roadmaps (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, duration TEXT);
      CREATE TABLE modules (id INTEGER PRIMARY KEY AUTOINCREMENT, roadmap_id INTEGER NOT NULL, title TEXT NOT NULL, duration TEXT);
      INSERT INTO roadmaps (id, title, description, duration) VALUES (50, 'Ruta interna', 'Contenido propio', '3 semanas');
      INSERT INTO modules (id, roadmap_id, title, duration) VALUES (60, 50, 'Módulo propio', '2 semanas');
    `)
    await legacyDb.close()
    process.chdir(tmp)

    const { openDb } = await import('../lib/db')
    const db = await openDb()
    const roadmap = await db.get(
      'SELECT title, category_id, duration_weeks_min, duration_weeks_max FROM roadmaps WHERE id = 50'
    )
    const moduleRow = await db.get(
      'SELECT title, level, duration_weeks_min, duration_weeks_max FROM modules WHERE id = 60'
    )

    expect(roadmap).toMatchObject({
      title: 'Ruta interna',
      category_id: null,
      duration_weeks_min: 3,
      duration_weeks_max: 3
    })
    expect(moduleRow).toMatchObject({
      title: 'Módulo propio',
      level: null,
      duration_weeks_min: 2,
      duration_weeks_max: 2
    })
    await db.close()
  })

  it('migrates schema, seeds the roadmap catalog and creates an env admin', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-db-'))
    process.chdir(tmp)
    process.env.ADMIN_EMAIL = 'ADMIN@EXAMPLE.COM'
    process.env.ADMIN_PASSWORD = 'ValidAdminPass123!'

    const { openDb } = await import('../lib/db')
    const db = await openDb()

    const awsRoadmap = await db.get('SELECT title FROM roadmaps WHERE title = ?', ['Roadmap AWS gratuito para cantera junior DevOps'])
    const aiRoadmap = await db.get('SELECT title FROM roadmaps WHERE title = ?', ['Roadmap IA para SRE/DevOps - Versión 2.0'])
    const iaRoadmap = await db.get('SELECT title, duration FROM roadmaps WHERE title = ?', ['IA para DevOps'])
    const moduleCounts = await db.all(`
      SELECT roadmaps.title, COUNT(modules.id) AS count
      FROM roadmaps
      LEFT JOIN modules ON modules.roadmap_id = roadmaps.id
      GROUP BY roadmaps.id
    `)
    const admin = await db.get('SELECT email, role, is_active, password_hash FROM users WHERE email = ?', ['admin@example.com'])
    const auditColumns = await db.all('PRAGMA table_info(audit_logs)')
    const modulesByRoadmap = Object.fromEntries(moduleCounts.map((row: any) => [row.title, row.count]))
    const lessonProgressColumns = await db.all('PRAGMA table_info(user_lesson_progress)')
    const roadmapProgressColumns = await db.all('PRAGMA table_info(user_roadmap_progress)')
    const quizAttemptColumns = await db.all('PRAGMA table_info(user_quiz_attempts)')
    const roadmapColumns = await db.all('PRAGMA table_info(roadmaps)')
    const moduleColumns = await db.all('PRAGMA table_info(modules)')
    const awsMetadata = await db.get(
      `SELECT roadmap_categories.key AS category_key,
              roadmaps.duration_weeks_min, roadmaps.duration_weeks_max,
              COUNT(DISTINCT roadmap_topics.topic_id) AS topic_count
       FROM roadmaps
       LEFT JOIN roadmap_categories ON roadmap_categories.id = roadmaps.category_id
       LEFT JOIN roadmap_topics ON roadmap_topics.roadmap_id = roadmaps.id
       WHERE roadmaps.title = ? GROUP BY roadmaps.id`,
      ['Roadmap AWS gratuito para cantera junior DevOps']
    )
    const classifiedAwsModules = await db.get(
      `SELECT COUNT(*) AS count FROM modules
       INNER JOIN roadmaps ON roadmaps.id = modules.roadmap_id
       WHERE roadmaps.title = ? AND modules.level IS NOT NULL
         AND modules.duration_weeks_min IS NOT NULL AND modules.duration_weeks_max IS NOT NULL`,
      ['Roadmap AWS gratuito para cantera junior DevOps']
    )

    expect(awsRoadmap.title).toBe('Roadmap AWS gratuito para cantera junior DevOps')
    expect(aiRoadmap.title).toBe('Roadmap IA para SRE/DevOps - Versión 2.0')
    expect(iaRoadmap.duration).toBe('6 meses (5-8 h/semana)')
    expect(modulesByRoadmap['Roadmap AWS gratuito para cantera junior DevOps']).toBe(11)
    expect(modulesByRoadmap['Roadmap IA para SRE/DevOps - Versión 2.0']).toBe(11)
    expect(modulesByRoadmap['IA para DevOps']).toBe(11)
    expect(admin.role).toBe('admin')
    expect(admin.is_active).toBe(1)
    expect(admin.password_hash).toMatch(/^scrypt:/)
    expect(auditColumns.map((column: any) => column.name)).toContain('action')
    expect(lessonProgressColumns.map((column: any) => column.name)).toEqual(expect.arrayContaining([
      'user_id',
      'lesson_id',
      'started_at',
      'last_activity_at',
      'completed_at',
      'time_spent_seconds'
    ]))
    expect(roadmapProgressColumns.map((column: any) => column.name)).toEqual(expect.arrayContaining([
      'user_id',
      'roadmap_id',
      'current_module_id',
      'current_lesson_id',
      'completed_lessons_count',
      'time_spent_seconds'
    ]))
    expect(quizAttemptColumns.map((column: any) => column.name)).toEqual(expect.arrayContaining([
      'user_id',
      'roadmap_id',
      'module_id',
      'quiz_scope',
      'score',
      'max_score',
      'answers',
      'submitted_at'
    ]))
    expect(roadmapColumns.map((column: any) => column.name)).toEqual(expect.arrayContaining([
      'category_id', 'duration_weeks_min', 'duration_weeks_max'
    ]))
    expect(moduleColumns.map((column: any) => column.name)).toEqual(expect.arrayContaining([
      'level', 'duration_weeks_min', 'duration_weeks_max'
    ]))
    expect(awsMetadata).toMatchObject({
      category_key: 'cloud-y-devops',
      duration_weeks_min: 11,
      duration_weeks_max: 12,
      topic_count: 6
    })
    expect(classifiedAwsModules.count).toBe(11)

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
    const iaRoadmapCount = await secondDb.get(
      'SELECT COUNT(*) AS count FROM roadmaps WHERE title = ?',
      ['IA para DevOps']
    )
    const moduleCount = await secondDb.get('SELECT COUNT(*) AS count FROM modules')
    const adminCount = await secondDb.get('SELECT COUNT(*) AS count FROM users WHERE email = ?', ['admin@example.com'])
    const roadmapProgressTable = await secondDb.get(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_roadmap_progress'"
    )
    const lessonProgressIndexes = await secondDb.all("PRAGMA index_list('user_lesson_progress')")
    const roadmapProgressIndexes = await secondDb.all("PRAGMA index_list('user_roadmap_progress')")
    const quizAttemptIndexes = await secondDb.all("PRAGMA index_list('user_quiz_attempts')")
    const moduleIndexes = await secondDb.all("PRAGMA index_list('modules')")
    const roadmapTopicCount = await secondDb.get('SELECT COUNT(*) AS count FROM roadmap_topics')
    const duplicateTopics = await secondDb.all(
      'SELECT key, COUNT(*) AS count FROM topics GROUP BY key HAVING COUNT(*) > 1'
    )

    expect(roadmapCount.count).toBe(1)
    expect(aiRoadmapCount.count).toBe(1)
    expect(iaRoadmapCount.count).toBe(1)
    expect(moduleCount.count).toBe(33)
    expect(adminCount.count).toBe(1)
    expect(roadmapProgressTable.name).toBe('user_roadmap_progress')
    expect(lessonProgressIndexes.map((index: any) => index.name)).toEqual(expect.arrayContaining([
      'idx_user_lesson_progress_user_id',
      'idx_user_lesson_progress_lesson_id',
      'idx_user_lesson_progress_last_activity'
    ]))
    expect(roadmapProgressIndexes.map((index: any) => index.name)).toEqual(expect.arrayContaining([
      'idx_user_roadmap_progress_user_id',
      'idx_user_roadmap_progress_roadmap_id',
      'idx_user_roadmap_progress_last_activity'
    ]))
    expect(quizAttemptIndexes.map((index: any) => index.name)).toEqual(expect.arrayContaining([
      'idx_user_quiz_attempts_user_id',
      'idx_user_quiz_attempts_roadmap_id',
      'idx_user_quiz_attempts_module_id',
      'idx_user_quiz_attempts_submitted_at'
    ]))
    expect(moduleIndexes.map((index: any) => index.name)).toContain('idx_modules_roadmap_id')
    expect(roadmapTopicCount.count).toBe(18)
    expect(duplicateTopics).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ADMIN_PASSWORD ignored'))

    await secondDb.close()
  })
})
