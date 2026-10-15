import type { DatabaseClient } from '../../../persistence/database'
import { normalizeMetadataKey, normalizeTopics } from '../metadata'
import type { MetadataRepository } from '../ports'

export async function saveRoadmapMetadata(
  db: DatabaseClient,
  roadmapId: number | string,
  categoryValue: unknown,
  topicsValue: unknown
) {
  const categoryLabel = String(categoryValue ?? '').trim().replace(/\s+/g, ' ')
  const categoryKey = normalizeMetadataKey(categoryLabel)
  let categoryId: number | null = null

  if (categoryKey) {
    await db.run(
      `INSERT INTO roadmap_categories (key, label) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET label = excluded.label`,
      [categoryKey, categoryLabel]
    )
    categoryId = (await db.get('SELECT id FROM roadmap_categories WHERE key = ?', [categoryKey])).id
  }

  await db.run('UPDATE roadmaps SET category_id = ? WHERE id = ?', [categoryId, roadmapId])
  await db.run('DELETE FROM roadmap_topics WHERE roadmap_id = ?', [roadmapId])

  for (const topicLabel of normalizeTopics(topicsValue)) {
    const topicKey = normalizeMetadataKey(topicLabel)
    await db.run(
      `INSERT INTO topics (key, label) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET label = excluded.label`,
      [topicKey, topicLabel]
    )
    const topic = await db.get('SELECT id FROM topics WHERE key = ?', [topicKey])
    // SQLite-only shorthand; PostgresDb.exec()/query() already rewrites this to
    // `ON CONFLICT DO NOTHING` for the Postgres backend (see lib/postgresDb.ts
    // translateSql), so no explicit branching is required here.
    await db.run(
      'INSERT OR IGNORE INTO roadmap_topics (roadmap_id, topic_id) VALUES (?, ?)',
      [roadmapId, topic.id]
    )
  }
}

export async function getRoadmapTopics(db: DatabaseClient, roadmapId: number | string) {
  const orderBy = db.backend === 'postgres'
    ? 'ORDER BY lower(topics.label), topics.key'
    : 'ORDER BY topics.label COLLATE NOCASE, topics.key'
  return db.all(
    `SELECT topics.key, topics.label
     FROM topics
     INNER JOIN roadmap_topics ON roadmap_topics.topic_id = topics.id
     WHERE roadmap_topics.roadmap_id = ?
     ${orderBy}`,
    [roadmapId]
  )
}

export function createMetadataRepository(db: DatabaseClient): MetadataRepository {
  return {
    save: (roadmapId, category, topics) => saveRoadmapMetadata(db, roadmapId, category, topics),
    getTopics: roadmapId => getRoadmapTopics(db, roadmapId)
  }
}
