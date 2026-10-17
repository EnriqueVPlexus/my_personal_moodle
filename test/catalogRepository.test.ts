import { describe, expect, it, vi } from 'vitest'
import { createCatalogRepository } from '../lib/domains/content/repositories/catalogRepository'
import { createLearnerViewRepository } from '../lib/domains/progress/repositories/learnerViewRepository'
import type { DatabaseClient } from '../lib/persistence/database'

/**
 * `pg` returns COUNT/SUM as text and EXISTS as a boolean; the repositories
 * must hand numbers and booleans to the layers above. The fake below plays
 * the PostgreSQL driver; the real round trip is covered by the Postgres
 * integration suite.
 */
function pgLikeDb(handlers: { all?: unknown[]; get?: unknown }) {
  return {
    backend: 'postgres',
    all: vi.fn(async () => handlers.all ?? []),
    get: vi.fn(async () => handlers.get)
  } as unknown as DatabaseClient
}

describe('catalog repository numeric normalization', () => {
  it('returns module_count of the catalog rows as a number', async () => {
    const repo = createCatalogRepository(pgLikeDb({ all: [{ id: 1, title: 'AWS', module_count: '4' }, { id: 2, title: 'GCP', module_count: '0' }] }))
    const rows = await repo.listCatalogRows()

    expect(rows.map(row => row.module_count)).toEqual([4, 0])
  })

  it('returns category, topic and level counts as numbers', async () => {
    const db = pgLikeDb({ all: [{ key: 'a', label: 'A', roadmap_count: '3' }] })
    const repo = createCatalogRepository(db)

    expect((await repo.listCategoryCounts(null))[0].roadmap_count).toBe(3)
    expect((await repo.listTopicCounts([1]))[0].roadmap_count).toBe(3)
    expect((await repo.listLevelCounts(null))[0].roadmap_count).toBe(3)
  })

  it('returns the duration stats as numbers, keeping empty min/max as null', async () => {
    const stats = await createCatalogRepository(pgLikeDb({
      get: { min_weeks: null, max_weeks: null, total_count: '0', up_to_4_count: null, from_5_to_12_count: null, over_12_count: null }
    })).getDurationStats(null)

    expect(stats).toEqual({
      min_weeks: null, max_weeks: null, total_count: 0, up_to_4_count: 0, from_5_to_12_count: 0, over_12_count: 0
    })

    const filled = await createCatalogRepository(pgLikeDb({
      get: { min_weeks: 2, max_weeks: '12', total_count: '5', up_to_4_count: '1', from_5_to_12_count: '3', over_12_count: '1' }
    })).getDurationStats(null)
    expect(filled).toEqual({
      min_weeks: 2, max_weeks: 12, total_count: 5, up_to_4_count: 1, from_5_to_12_count: 3, over_12_count: 1
    })
  })

  it('returns the unclassified count as a number', async () => {
    expect(await createCatalogRepository(pgLikeDb({ get: { count: '2' } })).countUnclassified(null)).toBe(2)
  })
})

describe('learner view has_evidence normalization', () => {
  it.each([[1, true], [0, false], [true, true], [false, false]])('maps %s to %s', async (raw, expected) => {
    const repo = createLearnerViewRepository(pgLikeDb({ all: [{ id: 1, has_evidence: raw }] }))
    const [row] = await repo.listRoadmapModules(1, 5)

    expect(row.has_evidence).toBe(expected)
  })

  it('does not add has_evidence for anonymous readers', async () => {
    const repo = createLearnerViewRepository(pgLikeDb({ all: [{ id: 1 }] }))
    const [row] = await repo.listRoadmapModules(1, null)

    expect(row).not.toHaveProperty('has_evidence')
  })
})
