import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { describe, expect, it } from 'vitest'
import {
  computeFilteredCatalogMetadata,
  filterAndRankRoadmaps,
  normalizeSearchText,
  parseRoadmapSearchQuery
} from '../lib/domains/content/search'
import { ROADMAP_CATALOG_SEARCH_SQL } from '../lib/domains/content/repositories/catalogRepository'
import {
  parseRoadmapCatalogFilters,
  roadmapDurationMatches
} from '../lib/domains/content/filters'

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
  it('parses canonical filter families, progress statuses and duration ranges', () => {
    expect(parseRoadmapCatalogFilters({
      category: ['cloud-y-devops', 'inteligencia-artificial'],
      topic: 'AWS,DevOps',
      level: 'advanced',
      duration: ['5-to-12', 'invalid'],
      progress_status: ['in_progress', 'invalid'],
      sort: 'duration'
    })).toEqual({
      categories: ['cloud-y-devops', 'inteligencia-artificial'],
      topics: ['aws', 'devops'],
      levels: ['advanced'],
      durations: ['5-to-12'],
      progressStatuses: ['in_progress'],
      sort: 'duration'
    })
    expect(roadmapDurationMatches(3, 6, ['up-to-4', 'over-12'])).toBe(true)
    expect(roadmapDurationMatches(null, null, ['5-to-12'])).toBe(false)
  })

  it('filters catalog rows by personal progress_status', () => {
    const rowsWithProgress = [
      { ...rows[0], user_progress_status: 'in_progress' },
      { ...rows[1], user_progress_status: 'completed' },
      { ...rows[2], user_progress_status: 'not_started' }
    ]

    const inProgress = filterAndRankRoadmaps(
      rowsWithProgress,
      parseRoadmapSearchQuery(''),
      parseRoadmapCatalogFilters({ progress_status: 'in_progress' })
    )
    const completed = filterAndRankRoadmaps(
      rowsWithProgress,
      parseRoadmapSearchQuery(''),
      parseRoadmapCatalogFilters({ progress_status: 'completed' })
    )
    const notStarted = filterAndRankRoadmaps(
      rowsWithProgress,
      parseRoadmapSearchQuery(''),
      parseRoadmapCatalogFilters({ progress_status: 'not_started' })
    )

    expect(inProgress.map(row => row.id)).toEqual([3])
    expect(completed.map(row => row.id)).toEqual([2])
    expect(notStarted.map(row => row.id)).toEqual([1])
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

  it('keeps the aggregate query indexed at the expected catalog volume', async () => {
    const db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE roadmaps (
        id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, objectives TEXT,
        methodology TEXT, category_id INTEGER, duration_weeks_min REAL, duration_weeks_max REAL
      );
      CREATE TABLE roadmap_categories (id INTEGER PRIMARY KEY, key TEXT, label TEXT);
      CREATE TABLE modules (
        id INTEGER PRIMARY KEY, roadmap_id INTEGER NOT NULL, title TEXT, objective TEXT,
        contents TEXT, level TEXT
      );
      CREATE TABLE topics (id INTEGER PRIMARY KEY, key TEXT, label TEXT);
      CREATE TABLE roadmap_topics (roadmap_id INTEGER, topic_id INTEGER, PRIMARY KEY (roadmap_id, topic_id));
      CREATE INDEX idx_modules_roadmap_id ON modules(roadmap_id);
      CREATE INDEX idx_roadmap_topics_topic_id ON roadmap_topics(topic_id);

      INSERT INTO roadmap_categories VALUES (1, 'cloud', 'Cloud');
      INSERT INTO topics VALUES (1, 'aws', 'AWS'), (2, 'devops', 'DevOps'), (3, 'iac', 'IaC');
      WITH RECURSIVE sequence(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 300)
      INSERT INTO roadmaps
      SELECT value, 'Roadmap ' || value, 'Descripción', '[]', '[]', 1, 8, 12 FROM sequence;
      WITH RECURSIVE sequence(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 2400)
      INSERT INTO modules
      SELECT value, CAST((value - 1) / 8 AS INTEGER) + 1, 'Módulo ' || value,
             'Objetivo', '["Contenido técnico"]', CASE WHEN value % 2 = 0 THEN 'beginner' ELSE 'intermediate' END
      FROM sequence;
      INSERT INTO roadmap_topics
      SELECT roadmaps.id, topics.id FROM roadmaps CROSS JOIN topics;
    `)

    const plan = await db.all(`EXPLAIN QUERY PLAN ${ROADMAP_CATALOG_SEARCH_SQL}`)
    const startedAt = performance.now()
    const catalogRows = await db.all(ROADMAP_CATALOG_SEARCH_SQL)
    const elapsedMs = performance.now() - startedAt

    expect(catalogRows).toHaveLength(300)
    expect(catalogRows.every(row => row.module_count === 8)).toBe(true)
    expect(plan.map(row => row.detail).join(' ')).toContain('idx_modules_roadmap_id')
    expect(elapsedMs).toBeLessThan(1500)

    await db.close()
  })

  it('recalculates disjunctive filter counts when a search query is active', () => {
    const sampleRows = [
      {
        id: 1,
        title: 'AWS para cantera DevOps',
        description: 'Ruta AWS',
        module_count: 12,
        module_search_text: '',
        category_key: 'cloud-y-devops',
        category_label: 'Cloud y DevOps',
        topics_metadata: 'aws\u001fAWS,terraform\u001fTerraform',
        module_levels: 'beginner,intermediate',
        duration_weeks_min: 10,
        duration_weeks_max: 12,
        user_progress_status: 'in_progress'
      },
      {
        id: 2,
        title: 'De 0 a 100 en AWS en 14 días',
        description: 'Ruta corta AWS',
        module_count: 1,
        module_search_text: '',
        category_key: 'aws',
        category_label: 'AWS',
        topics_metadata: 'aws\u001fAWS',
        module_levels: 'beginner',
        duration_weeks_min: 1.5,
        duration_weeks_max: 4,
        user_progress_status: 'not_started'
      },
      {
        id: 3,
        title: 'Roadmap de ejemplo',
        description: 'Pruebas unitarias',
        module_count: 1,
        module_search_text: '',
        category_key: 'desarrollo',
        category_label: 'Desarrollo',
        topics_metadata: 'testing\u001fTesting',
        module_levels: 'beginner',
        duration_weeks_min: 2,
        duration_weeks_max: 2,
        user_progress_status: 'completed'
      }
    ]

    const metadata = computeFilteredCatalogMetadata(
      sampleRows,
      parseRoadmapSearchQuery('AWS'),
      parseRoadmapCatalogFilters({})
    )

    expect(Object.fromEntries(metadata.duration_ranges.map(item => [item.key, item.roadmap_count])))
      .toEqual({ 'up-to-4': 1, '5-to-12': 1, 'over-12': 0 })
    expect(metadata.categories).toEqual([
      { key: 'aws', label: 'AWS', roadmap_count: 1 },
      { key: 'cloud-y-devops', label: 'Cloud y DevOps', roadmap_count: 1 },
      { key: 'desarrollo', label: 'Desarrollo', roadmap_count: 0 }
    ])
    expect(metadata.topics).toEqual([
      { key: 'aws', label: 'AWS', roadmap_count: 2 },
      { key: 'terraform', label: 'Terraform', roadmap_count: 1 },
      { key: 'testing', label: 'Testing', roadmap_count: 0 }
    ])
  })

  it('keeps the selected filter family disjunctive while intersecting all other active filters', () => {
    const sampleRows = [
      {
        id: 1,
        title: 'AWS para cantera DevOps',
        module_count: 12,
        module_search_text: '',
        category_key: 'cloud-y-devops',
        category_label: 'Cloud y DevOps',
        topics_metadata: 'aws\u001fAWS,terraform\u001fTerraform',
        module_levels: 'beginner,intermediate',
        duration_weeks_min: 10,
        duration_weeks_max: 12,
        user_progress_status: 'in_progress'
      },
      {
        id: 2,
        title: 'De 0 a 100 en AWS en 14 días',
        module_count: 1,
        module_search_text: '',
        category_key: 'aws',
        category_label: 'AWS',
        topics_metadata: 'aws\u001fAWS',
        module_levels: 'beginner',
        duration_weeks_min: 1.5,
        duration_weeks_max: 4,
        user_progress_status: 'not_started'
      },
      {
        id: 3,
        title: 'Roadmap de ejemplo',
        module_count: 1,
        module_search_text: '',
        category_key: 'desarrollo',
        category_label: 'Desarrollo',
        topics_metadata: 'testing\u001fTesting',
        module_levels: 'beginner',
        duration_weeks_min: 2,
        duration_weeks_max: 2,
        user_progress_status: 'completed'
      }
    ]

    const metadata = computeFilteredCatalogMetadata(
      sampleRows,
      parseRoadmapSearchQuery('AWS'),
      parseRoadmapCatalogFilters({ duration: 'up-to-4' })
    )

    // Duration keeps both AWS duration buckets visible (disjunctive on its own family)
    expect(Object.fromEntries(metadata.duration_ranges.map(item => [item.key, item.roadmap_count])))
      .toEqual({ 'up-to-4': 1, '5-to-12': 1, 'over-12': 0 })
    // Categories, topics, levels and progress statuses intersect q=AWS AND duration=up-to-4
    expect(metadata.categories).toEqual([
      { key: 'aws', label: 'AWS', roadmap_count: 1 },
      { key: 'cloud-y-devops', label: 'Cloud y DevOps', roadmap_count: 0 },
      { key: 'desarrollo', label: 'Desarrollo', roadmap_count: 0 }
    ])
    expect(metadata.topics).toEqual([
      { key: 'aws', label: 'AWS', roadmap_count: 1 },
      { key: 'terraform', label: 'Terraform', roadmap_count: 0 },
      { key: 'testing', label: 'Testing', roadmap_count: 0 }
    ])
    expect(Object.fromEntries(metadata.levels.map(item => [item.key, item.roadmap_count])))
      .toEqual({ beginner: 1, intermediate: 0, advanced: 0, capstone: 0 })
    expect(Object.fromEntries(metadata.progress_statuses.map(item => [item.key, item.roadmap_count])))
      .toEqual({ not_started: 1, in_progress: 0, completed: 0 })
  })
})
