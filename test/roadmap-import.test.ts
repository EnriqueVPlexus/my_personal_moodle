import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { describe, expect, it } from 'vitest'
import {
  persistRoadmapImport,
  RoadmapImportConflictError,
  validateRoadmapImport
} from '../lib/roadmapImport'

const validInput = {
  title: '  Plataforma Cloud  ',
  description: ' Ruta práctica ',
  duration: '2 semanas',
  category: ' Cloud ',
  topics: ['AWS', ' aws ', 'Terraform'],
  objectives: ['Desplegar infraestructura'],
  methodology: ['Práctica guiada'],
  evaluation_weights: { Práctica: '100%' },
  modules: [{
    position: 0,
    title: ' Fundamentos ',
    level: 'beginner',
    duration_weeks: 2,
    objective: 'Comprender la plataforma',
    contents: ['IAM'],
    importance: 'Esencial',
    official_resources: [
      'Documentación',
      { label: 'AWS', url: 'https://aws.amazon.com/' }
    ],
    support_videos: [{ label: 'Curso' }],
    practical_activity: ['Crear una cuenta'],
    deliverable_evidence: ['Captura'],
    evaluation: 'Revisión'
  }]
}

async function importDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database })
  await db.exec(`
    CREATE TABLE roadmaps (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT UNIQUE NOT NULL, description TEXT,
      duration TEXT, duration_weeks_min REAL, duration_weeks_max REAL, objectives TEXT,
      methodology TEXT, evaluation_weights TEXT, category_id INTEGER
    );
    CREATE TABLE modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT, roadmap_id INTEGER, position INTEGER, title TEXT,
      duration TEXT, duration_weeks_min REAL, duration_weeks_max REAL, level TEXT, objective TEXT,
      contents TEXT, importance TEXT, official_resources TEXT, support_videos TEXT,
      practical_activity TEXT, deliverable_evidence TEXT, evaluation TEXT
    );
    CREATE TABLE roadmap_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, label TEXT);
    CREATE TABLE topics (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, label TEXT);
    CREATE TABLE roadmap_topics (roadmap_id INTEGER, topic_id INTEGER, PRIMARY KEY (roadmap_id, topic_id));
  `)
  return db
}

describe('roadmap JSON import validation', () => {
  it('normalizes a complete valid roadmap', () => {
    const result = validateRoadmapImport(validInput)

    expect(result.valid).toBe(true)
    expect(result.roadmap).toMatchObject({
      title: 'Plataforma Cloud',
      description: 'Ruta práctica',
      duration_weeks_min: 2,
      duration_weeks_max: 2,
      category: 'Cloud',
      topics: ['AWS', 'Terraform'],
      evaluation_weights: { Práctica: '100%' }
    })
    expect(result.roadmap?.modules[0]).toMatchObject({
      title: 'Fundamentos',
      level: 'beginner',
      duration_weeks_min: 2,
      official_resources: [
        { label: 'Documentación' },
        { label: 'AWS', url: 'https://aws.amazon.com/' }
      ]
    })
  })

  it('derives total duration from modules and defaults positions', () => {
    const result = validateRoadmapImport({
      title: 'Ruta',
      modules: [
        { title: 'Uno', duration: '1 semana' },
        { title: 'Dos', duration_weeks_min: 2, duration_weeks_max: 3 }
      ]
    })

    expect(result.roadmap).toMatchObject({ duration_weeks_min: 3, duration_weeks_max: 4 })
    expect(result.roadmap?.modules.map(item => item.position)).toEqual([0, 1])
  })

  it('reports structural and field errors with their JSON paths', () => {
    expect(validateRoadmapImport(null)).toEqual({
      valid: false,
      issues: [{ path: '$', message: 'El JSON debe contener un objeto.' }],
      roadmap: null
    })

    const result = validateRoadmapImport({
      title: '',
      description: 4,
      duration_weeks_min: 4,
      duration_weeks_max: 2,
      category: {},
      topics: 'AWS',
      objectives: ['', 2],
      methodology: {},
      evaluation_weights: { '': '20%', Test: 3 },
      modules: [
        'bad module',
        {
          position: -1,
          title: '',
          level: 'expert',
          duration_weeks_min: 'no',
          contents: 'content',
          official_resources: [4, { label: '', url: 'ftp://example.com' }],
          support_videos: 'video',
          practical_activity: [null],
          deliverable_evidence: {},
          evaluation: 3
        },
        { position: -1, title: 'Duplicate' }
      ]
    })

    expect(result.valid).toBe(false)
    expect(result.roadmap).toBeNull()
    expect(result.issues.map(issue => issue.path)).toEqual(expect.arrayContaining([
      'title', 'description', 'duration_weeks', 'topics', 'objectives[0]', 'objectives[1]',
      'evaluation_weights.?', 'evaluation_weights.Test', 'modules[0]', 'modules[1].position',
      'modules[1].title', 'modules[1].level', 'modules[1].duration_weeks',
      'modules[1].official_resources[0]', 'modules[1].official_resources[1].url',
      'modules[2].position'
    ]))
  })

  it('requires modules and enforces collection and text limits', () => {
    expect(validateRoadmapImport({ title: 'Empty', modules: [] }).issues[0].path).toBe('modules')
    const tooManyModules = Array.from({ length: 101 }, (_, position) => ({ title: `M${position}`, position }))
    const tooManyTopics = Array.from({ length: 21 }, (_, index) => `T${index}`)
    const result = validateRoadmapImport({
      title: 'x'.repeat(201),
      topics: tooManyTopics,
      objectives: Array.from({ length: 101 }, () => 'x'),
      modules: tooManyModules
    })
    expect(result.issues.map(issue => issue.message)).toEqual(expect.arrayContaining([
      'No puede superar 200 caracteres.',
      'No puede contener más de 20 elementos.',
      'No puede contener más de 100 elementos.',
      'No puede incluir más de 100 módulos.'
    ]))
  })
})

describe('roadmap JSON import persistence', () => {
  it('creates a roadmap, metadata and modules atomically', async () => {
    const db = await importDb()
    const roadmap = validateRoadmapImport(validInput).roadmap!

    const result = await persistRoadmapImport(db, roadmap, 'create')

    expect(result).toEqual({ roadmap_id: 1, created_modules: 1, updated_modules: 0 })
    expect(await db.get('SELECT title, category_id FROM roadmaps WHERE id = 1')).toMatchObject({
      title: 'Plataforma Cloud', category_id: 1
    })
    expect(await db.get('SELECT title, contents FROM modules WHERE roadmap_id = 1')).toEqual({
      title: 'Fundamentos', contents: '["IAM"]'
    })
    expect((await db.all('SELECT label FROM topics ORDER BY label')).map(row => row.label)).toEqual(['AWS', 'Terraform'])
    await db.close()
  })

  it('updates matching modules, adds new ones and preserves omitted modules', async () => {
    const db = await importDb()
    const original = validateRoadmapImport(validInput).roadmap!
    await persistRoadmapImport(db, original, 'create')
    await db.run('INSERT INTO modules (roadmap_id, position, title) VALUES (1, 9, ?)', ['Conservar'])

    const changed = validateRoadmapImport({
      ...validInput,
      description: 'Actualizada',
      modules: [
        { position: 0, title: 'Fundamentos nuevos' },
        { position: 1, title: 'Automatización' }
      ]
    }).roadmap!
    const result = await persistRoadmapImport(db, changed, 'update')

    expect(result).toEqual({ roadmap_id: 1, created_modules: 1, updated_modules: 1 })
    expect(await db.get('SELECT description FROM roadmaps WHERE id = 1')).toEqual({ description: 'Actualizada' })
    expect((await db.all('SELECT title FROM modules ORDER BY position')).map(row => row.title)).toEqual([
      'Fundamentos nuevos', 'Automatización', 'Conservar'
    ])
    await db.close()
  })

  it('matches an existing module by title when its position changes', async () => {
    const db = await importDb()
    const original = validateRoadmapImport(validInput).roadmap!
    await persistRoadmapImport(db, original, 'create')
    const moved = validateRoadmapImport({ ...validInput, modules: [{ position: 3, title: 'Fundamentos' }] }).roadmap!

    const result = await persistRoadmapImport(db, moved, 'update')
    expect(result.updated_modules).toBe(1)
    expect(await db.get('SELECT COUNT(*) AS count, position FROM modules')).toEqual({ count: 1, position: 3 })
    await db.close()
  })

  it.each([
    ['create', 'already_exists'],
    ['update', 'not_found']
  ] as const)('rolls back %s conflicts', async (strategy, code) => {
    const db = await importDb()
    const roadmap = validateRoadmapImport(validInput).roadmap!
    if (strategy === 'create') await persistRoadmapImport(db, roadmap, 'create')

    await expect(persistRoadmapImport(db, roadmap, strategy)).rejects.toMatchObject({
      code
    } satisfies Partial<RoadmapImportConflictError>)
    expect(await db.get('SELECT COUNT(*) AS count FROM roadmaps')).toEqual({ count: strategy === 'create' ? 1 : 0 })
    await db.close()
  })
})
