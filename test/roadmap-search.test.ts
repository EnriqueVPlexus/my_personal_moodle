import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { describe, expect, it } from 'vitest'
import {
  filterAndRankRoadmaps,
  normalizeSearchText,
  parseRoadmapSearchQuery,
  ROADMAP_CATALOG_SEARCH_SQL
} from '../lib/roadmapSearch'

const rows = [
  {
    id: 3,
    title: 'AWS para operaciones',
    description: 'Ruta cloud con observabilidad',
    objectives: '["Administrar infraestructura"]',
    methodology: null,
    module_count: 2,
    module_search_text: 'EC2 Crear una instancia Métricas y alarmas'
  },
  {
    id: 2,
    title: 'IA para DevOps',
    description: 'Automatizacion aplicada',
    objectives: '["Evaluar modelos"]',
    methodology: '["Practica guiada"]',
    module_count: 3,
    module_search_text: 'Evaluación de prompts Observabilidad de agentes'
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
        category_id INTEGER
      );
      CREATE TABLE roadmap_categories (id INTEGER PRIMARY KEY, key TEXT, label TEXT);
      CREATE TABLE topics (id INTEGER PRIMARY KEY, key TEXT, label TEXT);
      CREATE TABLE roadmap_topics (roadmap_id INTEGER, topic_id INTEGER);
      CREATE TABLE modules (
        id INTEGER PRIMARY KEY,
        roadmap_id INTEGER NOT NULL,
        title TEXT,
        objective TEXT,
        contents TEXT
      );
      INSERT INTO roadmap_categories VALUES (1, 'artificial-intelligence', 'Inteligencia artificial');
      INSERT INTO topics VALUES (1, 'observabilidad', 'Observabilidad');
      INSERT INTO roadmaps VALUES (1, 'IA', 'Automatizacion', '[]', '[]', 1);
      INSERT INTO roadmap_topics VALUES (1, 1);
      INSERT INTO modules VALUES (10, 1, 'Prompts', 'Evaluar respuestas', '["Observabilidad"]');
      INSERT INTO modules VALUES (11, 1, 'Agentes', 'Crear agente', '["Memoria"]');
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
