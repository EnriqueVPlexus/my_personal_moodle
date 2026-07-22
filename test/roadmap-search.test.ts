import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { describe, expect, it } from 'vitest'
import {
  filterAndRankRoadmaps,
  normalizeSearchText,
  parseRoadmapSearchQuery,
  ROADMAP_CATALOG_SEARCH_SQL
} from '../lib/roadmapSearch'
import {
  parseRoadmapCatalogFilters,
  roadmapDurationMatches
} from '../lib/roadmapFilters'

const rows = [
  {
    id: 3,
    title: 'AWS para operaciones',
    description: 'Ruta cloud con observabilidad',
    objectives: '["Administrar infraestructura"]',
    methodology: null,
    module_count: 2,
    module_search_text: 'EC2 Crear una instancia Métricas y alarmas',
    category_key: 'cloud-y-devops',
    topics_metadata: 'aws\u001fAWS,devops\u001fDevOps',
    module_levels: 'beginner,intermediate',
    duration_weeks_min: 10,
    duration_weeks_max: 12
  },
  {
    id: 2,
    title: 'IA para DevOps',
    description: 'Automatizacion aplicada',
    objectives: '["Evaluar modelos"]',
    methodology: '["Practica guiada"]',
    module_count: 3,
    module_search_text: 'Evaluación de prompts Observabilidad de agentes',
    category_key: 'inteligencia-artificial',
    topics_metadata: 'ia\u001fIA,devops\u001fDevOps',
    module_levels: 'intermediate,advanced',
    duration_weeks_min: 24,
    duration_weeks_max: 24
  },
  {
    id: 1,
    title: 'Fundamentos internos',
    description: 'Objetivo de disponibilidad 99.9%',
    module_count: 1,
    module_search_text: 'Introduccion'
  }
]

describe('roadmap search helpers', () => {
  it('parses canonical filter families and duration ranges', () => {
    expect(parseRoadmapCatalogFilters({
      category: ['cloud-y-devops', 'inteligencia-artificial'],
      topic: 'AWS,DevOps',
      level: 'advanced',
      duration: ['5-to-12', 'invalid'],
      sort: 'duration'
    })).toEqual({
      categories: ['cloud-y-devops', 'inteligencia-artificial'],
      topics: ['aws', 'devops'],
      levels: ['advanced'],
      durations: ['5-to-12'],
      sort: 'duration'
    })
    expect(roadmapDurationMatches(3, 6, ['up-to-4', 'over-12'])).toBe(true)
    expect(roadmapDurationMatches(null, null, ['5-to-12'])).toBe(false)
  })

  it('combines filter families with AND and values within a family with OR', () => {
    const filters = parseRoadmapCatalogFilters({
      category: 'cloud-y-devops',
      topic: ['aws', 'ia'],
      level: 'beginner',
      duration: '5-to-12',
      sort: 'title'
    })
    const result = filterAndRankRoadmaps(rows, parseRoadmapSearchQuery(''), filters)
    const withinFamily = filterAndRankRoadmaps(
      rows,
      parseRoadmapSearchQuery(''),
      parseRoadmapCatalogFilters({ topic: ['aws', 'ia'], sort: 'title' })
    )

    expect(result.map(row => row.id)).toEqual([3])
    expect(withinFamily.map(row => row.id)).toEqual([3, 2])
  })

  it('orders filtered catalog results by comparable duration', () => {
    const filters = parseRoadmapCatalogFilters({ sort: 'duration' })
    const result = filterAndRankRoadmaps(rows, parseRoadmapSearchQuery(''), filters)

    expect(result.map(row => row.id)).toEqual([3, 2, 1])
  })

  it('normalizes casing, accents and repeated whitespace', () => {
    expect(normalizeSearchText('  EVALUACIÓN   técnica  ')).toBe('evaluacion tecnica')
    expect(parseRoadmapSearchQuery(['  IA   DevOps  ', 'ignored'])).toMatchObject({
      query: 'IA DevOps',
      normalizedQuery: 'ia devops',
      terms: ['ia', 'devops'],
      tooLong: false
    })
  })

  it('matches roadmap and module content accent-insensitively without exposing search text', () => {
    const result = filterAndRankRoadmaps(rows, parseRoadmapSearchQuery('evaluacion'))

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 2, title: 'IA para DevOps', module_count: 3 })
    expect(result[0]).not.toHaveProperty('module_search_text')
  })

  it('requires every term, ranks title matches first and treats SQL wildcards literally', () => {
    const ranked = filterAndRankRoadmaps(rows, parseRoadmapSearchQuery('aws operaciones'))
    const literalWildcard = filterAndRankRoadmaps(rows, parseRoadmapSearchQuery('99.9%'))
    const missingTerm = filterAndRankRoadmaps(rows, parseRoadmapSearchQuery('aws kubernetes'))

    expect(ranked.map(row => row.id)).toEqual([3])
    expect(literalWildcard.map(row => row.id)).toEqual([1])
    expect(missingTerm).toEqual([])
  })

  it('preserves database order for an empty query and detects excessive input', () => {
    const result = filterAndRankRoadmaps(rows, parseRoadmapSearchQuery('   '))

    expect(result.map(row => row.id)).toEqual([3, 2, 1])
    expect(result.every(row => !('module_search_text' in row))).toBe(true)
    expect(parseRoadmapSearchQuery('a'.repeat(101)).tooLong).toBe(true)
  })

  it('aggregates searchable module content in one real SQLite query', async () => {
    const db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE roadmaps (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        objectives TEXT,
        methodology TEXT,
        category_id INTEGER,
        duration_weeks_min REAL,
        duration_weeks_max REAL
      );
      CREATE TABLE roadmap_categories (id INTEGER PRIMARY KEY, key TEXT, label TEXT);
      CREATE TABLE topics (id INTEGER PRIMARY KEY, key TEXT, label TEXT);
      CREATE TABLE roadmap_topics (roadmap_id INTEGER, topic_id INTEGER);
      CREATE TABLE modules (
        id INTEGER PRIMARY KEY,
        roadmap_id INTEGER NOT NULL,
        title TEXT,
        objective TEXT,
        contents TEXT,
        level TEXT
      );
      INSERT INTO roadmap_categories VALUES (1, 'artificial-intelligence', 'Inteligencia artificial');
      INSERT INTO topics VALUES (1, 'observabilidad', 'Observabilidad');
      INSERT INTO roadmaps VALUES (1, 'IA', 'Automatizacion', '[]', '[]', 1, 8, 10);
      INSERT INTO roadmap_topics VALUES (1, 1);
      INSERT INTO modules VALUES (10, 1, 'Prompts', 'Evaluar respuestas', '["Observabilidad"]', 'intermediate');
      INSERT INTO modules VALUES (11, 1, 'Agentes', 'Crear agente', '["Memoria"]', 'advanced');
    `)

    const catalogRows = await db.all(ROADMAP_CATALOG_SEARCH_SQL)
    const result = filterAndRankRoadmaps(catalogRows, parseRoadmapSearchQuery('observabilidad'))

    expect(catalogRows[0]).toMatchObject({ module_count: 2 })
    expect(catalogRows[0].module_search_text).toContain('Observabilidad')
    expect(result).toEqual([expect.objectContaining({ id: 1, title: 'IA', module_count: 2 })])
    expect(result[0]).not.toHaveProperty('module_search_text')
    expect(result[0]).toMatchObject({
      category: { key: 'artificial-intelligence', label: 'Inteligencia artificial' },
      topics: [{ key: 'observabilidad', label: 'Observabilidad' }]
    })

    await db.close()
  })
})
