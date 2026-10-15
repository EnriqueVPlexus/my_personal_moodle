import type { DatabaseClient } from '../../../persistence/database'
import { toCount, toNullableNumber, withCounts } from '../../../persistence/normalize'
import type { CatalogRepository } from '../ports'

/**
 * Read models for the roadmap catalog: the search listing and the filter
 * metadata aggregates. Raw SQL stays here (with its SQLite and PostgreSQL
 * variants) so handlers and services never see the driver.
 */

export const ROADMAP_CATALOG_SEARCH_SQL = `
  WITH module_catalog AS (
    SELECT
      roadmap_id,
      COUNT(*) AS module_count,
      GROUP_CONCAT(DISTINCT level) AS module_levels,
      GROUP_CONCAT(
        COALESCE(title, '') || ' ' ||
        COALESCE(objective, '') || ' ' ||
        COALESCE(contents, ''),
        ' '
      ) AS module_search_text
    FROM modules
    GROUP BY roadmap_id
  ),
  topic_catalog AS (
    SELECT
      roadmap_topics.roadmap_id,
      GROUP_CONCAT(DISTINCT topics.key || char(31) || topics.label) AS topics_metadata
    FROM roadmap_topics
    INNER JOIN topics ON topics.id = roadmap_topics.topic_id
    GROUP BY roadmap_topics.roadmap_id
  )
  SELECT
    roadmaps.*,
    roadmap_categories.key AS category_key,
    roadmap_categories.label AS category_label,
    COALESCE(module_catalog.module_count, 0) AS module_count,
    module_catalog.module_levels,
    topic_catalog.topics_metadata,
    COALESCE(module_catalog.module_search_text, '') AS module_search_text
  FROM roadmaps
  LEFT JOIN roadmap_categories ON roadmap_categories.id = roadmaps.category_id
  LEFT JOIN module_catalog ON module_catalog.roadmap_id = roadmaps.id
  LEFT JOIN topic_catalog ON topic_catalog.roadmap_id = roadmaps.id
  ORDER BY roadmaps.id DESC
`

export const POSTGRES_ROADMAP_CATALOG_SEARCH_SQL = `
  WITH module_catalog AS (
    SELECT
      roadmap_id,
      COUNT(*) AS module_count,
      STRING_AGG(DISTINCT level, ',') AS module_levels,
      STRING_AGG(
        COALESCE(title, '') || ' ' ||
        COALESCE(objective, '') || ' ' ||
        COALESCE(contents, ''),
        ' '
      ) AS module_search_text
    FROM modules
    GROUP BY roadmap_id
  ),
  topic_catalog AS (
    SELECT
      roadmap_topics.roadmap_id,
      STRING_AGG(DISTINCT topics.key || chr(31) || topics.label, ',') AS topics_metadata
    FROM roadmap_topics
    INNER JOIN topics ON topics.id = roadmap_topics.topic_id
    GROUP BY roadmap_topics.roadmap_id
  )
  SELECT
    roadmaps.*,
    roadmap_categories.key AS category_key,
    roadmap_categories.label AS category_label,
    COALESCE(module_catalog.module_count, 0) AS module_count,
    module_catalog.module_levels,
    topic_catalog.topics_metadata,
    COALESCE(module_catalog.module_search_text, '') AS module_search_text
  FROM roadmaps
  LEFT JOIN roadmap_categories ON roadmap_categories.id = roadmaps.category_id
  LEFT JOIN module_catalog ON module_catalog.roadmap_id = roadmaps.id
  LEFT JOIN topic_catalog ON topic_catalog.roadmap_id = roadmaps.id
  ORDER BY roadmaps.id DESC
`

function placeholders(ids: number[]) {
  return ids.map(() => '?').join(', ')
}

export function createCatalogRepository(db: DatabaseClient): CatalogRepository {
  return {
    async listCatalogRows() {
      const rows = await db.all(db.backend === 'postgres' ? POSTGRES_ROADMAP_CATALOG_SEARCH_SQL : ROADMAP_CATALOG_SEARCH_SQL)
      return rows.map(row => withCounts(row, ['module_count']))
    },

    async listCategoryCounts(roadmapIds) {
      const restriction = roadmapIds ? `WHERE roadmaps.id IN (${placeholders(roadmapIds)})` : ''
      const rows = await db.all(
        `SELECT roadmap_categories.key, roadmap_categories.label, COUNT(roadmaps.id) AS roadmap_count
         FROM roadmap_categories
         INNER JOIN roadmaps ON roadmaps.category_id = roadmap_categories.id
         ${restriction}
         GROUP BY roadmap_categories.id
         ORDER BY roadmap_categories.label COLLATE NOCASE, roadmap_categories.key`,
        roadmapIds ?? []
      )
      return rows.map(row => withCounts(row, ['roadmap_count']))
    },

    async listTopicCounts(roadmapIds) {
      const restriction = roadmapIds ? `WHERE roadmap_topics.roadmap_id IN (${placeholders(roadmapIds)})` : ''
      const rows = await db.all(
        `SELECT topics.key, topics.label, COUNT(roadmap_topics.roadmap_id) AS roadmap_count
         FROM topics
         INNER JOIN roadmap_topics ON roadmap_topics.topic_id = topics.id
         ${restriction}
         GROUP BY topics.id
         ORDER BY topics.label COLLATE NOCASE, topics.key`,
        roadmapIds ?? []
      )
      return rows.map(row => withCounts(row, ['roadmap_count']))
    },

    async getDurationStats(roadmapIds) {
      const restriction = roadmapIds ? `WHERE roadmaps.id IN (${placeholders(roadmapIds)})` : ''
      const row = await db.get(
        `SELECT MIN(duration_weeks_min) AS min_weeks,
                MAX(duration_weeks_max) AS max_weeks,
                COUNT(*) AS total_count,
                SUM(CASE WHEN duration_weeks_min <= 4 AND duration_weeks_max >= 0 THEN 1 ELSE 0 END) AS up_to_4_count,
                SUM(CASE WHEN duration_weeks_min <= 12 AND duration_weeks_max >= 5 THEN 1 ELSE 0 END) AS from_5_to_12_count,
                SUM(CASE WHEN duration_weeks_max >= 13 THEN 1 ELSE 0 END) AS over_12_count
         FROM roadmaps ${restriction}`,
        roadmapIds ?? []
      )
      if (!row) return undefined
      return {
        min_weeks: toNullableNumber(row.min_weeks),
        max_weeks: toNullableNumber(row.max_weeks),
        total_count: toCount(row.total_count),
        up_to_4_count: toCount(row.up_to_4_count),
        from_5_to_12_count: toCount(row.from_5_to_12_count),
        over_12_count: toCount(row.over_12_count)
      }
    },

    async listLevelCounts(roadmapIds) {
      const restriction = roadmapIds ? `AND roadmap_id IN (${placeholders(roadmapIds)})` : ''
      const rows = await db.all(
        `SELECT level AS key, COUNT(DISTINCT roadmap_id) AS roadmap_count
         FROM modules WHERE level IS NOT NULL ${restriction} GROUP BY level`,
        roadmapIds ?? []
      )
      return rows.map(row => withCounts(row, ['roadmap_count']))
    },

    async countUnclassified(roadmapIds) {
      const row = await db.get(
        `SELECT COUNT(*) AS count FROM roadmaps
         WHERE category_id IS NULL ${roadmapIds ? `AND id IN (${placeholders(roadmapIds)})` : ''}`,
        roadmapIds ?? []
      )
      return toCount(row.count)
    }
  }
}
