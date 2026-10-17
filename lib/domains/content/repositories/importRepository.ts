import type { DatabaseClient } from '../../../persistence/database'
import {
  RoadmapImportConflictError,
  type NormalizedRoadmapImport,
  type RoadmapImportStrategy
} from '../import'
import type { ModuleLevel } from '../metadata'
import type { ImportRepository } from '../ports'
import { saveRoadmapMetadata } from './metadataRepository'

/**
 * Writes the whole import (roadmap, metadata, modules) in one transaction:
 * either everything is persisted or nothing is. Statements are plain
 * parameterized SQL on the `tx` client, which both backends translate.
 */
export function persistRoadmapImport(
  db: DatabaseClient,
  roadmap: NormalizedRoadmapImport,
  strategy: RoadmapImportStrategy
) {
  return db.transaction(tx => applyRoadmapImport(tx, roadmap, strategy))
}

async function applyRoadmapImport(
  db: DatabaseClient,
  roadmap: NormalizedRoadmapImport,
  strategy: RoadmapImportStrategy
) {
  const existing = await db.get('SELECT id FROM roadmaps WHERE title = ?', [roadmap.title])
  if (strategy === 'create' && existing) throw new RoadmapImportConflictError('already_exists')
  if (strategy === 'update' && !existing) throw new RoadmapImportConflictError('not_found')

  let roadmapId = existing?.id
  const roadmapValues = [
    roadmap.title,
    roadmap.description,
    roadmap.duration,
    roadmap.duration_weeks_min,
    roadmap.duration_weeks_max,
    JSON.stringify(roadmap.objectives),
    JSON.stringify(roadmap.methodology),
    JSON.stringify(roadmap.evaluation_weights),
    roadmap.version,
    roadmap.published_at
  ]
  if (roadmapId) {
    await db.run(
      `UPDATE roadmaps SET title = ?, description = ?, duration = ?, duration_weeks_min = ?,
       duration_weeks_max = ?, objectives = ?, methodology = ?, evaluation_weights = ?,
       version = ?, published_at = ? WHERE id = ?`,
      [...roadmapValues, roadmapId]
    )
  } else {
    const result = await db.run(
      `INSERT INTO roadmaps (
         title, description, duration, duration_weeks_min, duration_weeks_max,
         objectives, methodology, evaluation_weights, version, published_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      roadmapValues
    )
    roadmapId = result.lastID
  }

  await saveRoadmapMetadata(db, roadmapId, roadmap.category, roadmap.topics)
  let createdModules = 0
  let updatedModules = 0
  for (const moduleItem of roadmap.modules) {
    let moduleRow = await db.get(
      'SELECT id FROM modules WHERE roadmap_id = ? AND position = ?',
      [roadmapId, moduleItem.position]
    )
    if (!moduleRow) {
      moduleRow = await db.get(
        'SELECT id FROM modules WHERE roadmap_id = ? AND title = ?',
        [roadmapId, moduleItem.title]
      )
    }
    const values = [
      roadmapId,
      moduleItem.position,
      moduleItem.title,
      moduleItem.duration,
      moduleItem.duration_weeks_min,
      moduleItem.duration_weeks_max,
      moduleItem.level,
      moduleItem.objective,
      JSON.stringify(moduleItem.contents),
      moduleItem.importance,
      JSON.stringify(moduleItem.official_resources),
      JSON.stringify(moduleItem.support_videos),
      JSON.stringify(moduleItem.practical_activity),
      JSON.stringify(moduleItem.deliverable_evidence),
      moduleItem.evaluation,
      moduleItem.quiz.length ? JSON.stringify(moduleItem.quiz) : null
    ]
    if (moduleRow) {
      await db.run(
        `UPDATE modules SET roadmap_id = ?, position = ?, title = ?, duration = ?,
         duration_weeks_min = ?, duration_weeks_max = ?, level = ?, objective = ?, contents = ?,
         importance = ?, official_resources = ?, support_videos = ?, practical_activity = ?,
         deliverable_evidence = ?, evaluation = ?, quiz_bank = ? WHERE id = ?`,
        [...values, moduleRow.id]
      )
      updatedModules += 1
    } else {
      await db.run(
        `INSERT INTO modules (
           roadmap_id, position, title, duration, duration_weeks_min, duration_weeks_max,
           level, objective, contents, importance, official_resources, support_videos,
           practical_activity, deliverable_evidence, evaluation, quiz_bank
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      )
      createdModules += 1
    }
  }

  return { roadmap_id: Number(roadmapId), created_modules: createdModules, updated_modules: updatedModules }
}

function parseJsonArray(value: unknown): any[] {
  if (!value || typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseJsonObject(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export async function exportRoadmapAsJson(
  db: DatabaseClient,
  roadmapId: number | string
): Promise<NormalizedRoadmapImport | null> {
  const roadmap = await db.get(
    `SELECT
       roadmaps.*,
       roadmap_categories.label AS category_label
     FROM roadmaps
     LEFT JOIN roadmap_categories ON roadmap_categories.id = roadmaps.category_id
     WHERE roadmaps.id = ?`,
    [roadmapId]
  )

  if (!roadmap) return null

  const topicsOrderBy = db.backend === 'postgres'
    ? 'ORDER BY lower(topics.label), topics.key'
    : 'ORDER BY topics.label COLLATE NOCASE, topics.key'
  const topicRows = await db.all(
    `SELECT topics.label
     FROM topics
     INNER JOIN roadmap_topics ON roadmap_topics.topic_id = topics.id
     WHERE roadmap_topics.roadmap_id = ?
     ${topicsOrderBy}`,
    [roadmapId]
  )
  const topics = topicRows.map((t: any) => String(t.label))

  const moduleRows = await db.all(
    `SELECT *
     FROM modules
     WHERE roadmap_id = ?
     ORDER BY COALESCE(position, id), id`,
    [roadmapId]
  )

  const modules = moduleRows.map((m: any, index: number) => ({
    position: m.position !== null && m.position !== undefined ? Number(m.position) : index,
    title: String(m.title || ''),
    level: m.level ? (String(m.level) as ModuleLevel) : null,
    duration: m.duration ? String(m.duration) : null,
    duration_weeks_min: m.duration_weeks_min !== null && m.duration_weeks_min !== undefined ? Number(m.duration_weeks_min) : null,
    duration_weeks_max: m.duration_weeks_max !== null && m.duration_weeks_max !== undefined ? Number(m.duration_weeks_max) : null,
    objective: m.objective ? String(m.objective) : null,
    contents: parseJsonArray(m.contents),
    importance: m.importance ? String(m.importance) : null,
    official_resources: parseJsonArray(m.official_resources),
    support_videos: parseJsonArray(m.support_videos),
    practical_activity: parseJsonArray(m.practical_activity),
    deliverable_evidence: parseJsonArray(m.deliverable_evidence),
    evaluation: m.evaluation ? String(m.evaluation) : null,
    quiz: parseJsonArray(m.quiz_bank)
  }))

  return {
    title: String(roadmap.title || ''),
    description: roadmap.description ? String(roadmap.description) : null,
    duration: roadmap.duration ? String(roadmap.duration) : null,
    duration_weeks_min: roadmap.duration_weeks_min !== null && roadmap.duration_weeks_min !== undefined ? Number(roadmap.duration_weeks_min) : null,
    duration_weeks_max: roadmap.duration_weeks_max !== null && roadmap.duration_weeks_max !== undefined ? Number(roadmap.duration_weeks_max) : null,
    category: roadmap.category_label ? String(roadmap.category_label) : null,
    topics,
    objectives: parseJsonArray(roadmap.objectives),
    methodology: parseJsonArray(roadmap.methodology),
    evaluation_weights: parseJsonObject(roadmap.evaluation_weights),
    version: String(roadmap.version || 'v1.0.0'),
    published_at: String(roadmap.published_at || new Date().toISOString()),
    modules
  }
}

export async function findRoadmapIdAndTitleByTitle(
  db: DatabaseClient,
  title: string
): Promise<{ id: number; title: string } | undefined> {
  return db.get('SELECT id, title FROM roadmaps WHERE title = ?', [title])
}

export function createImportRepository(db: DatabaseClient): ImportRepository {
  return {
    findByTitle: title => findRoadmapIdAndTitleByTitle(db, title),
    persist: (roadmap, strategy) => persistRoadmapImport(db, roadmap, strategy),
    exportRoadmap: roadmapId => exportRoadmapAsJson(db, roadmapId)
  }
}
