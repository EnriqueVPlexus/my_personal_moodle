import { Selectable } from 'kysely'
import type { DatabaseClient } from './database'
import type { PostgresDb } from './postgresDb'
import { getQueryDatabase, LessonsTable } from './kyselyDatabase'

export type LessonRow = Selectable<LessonsTable>
export type LessonWithRoadmapId = LessonRow & { roadmap_id: number }

function pool(db: DatabaseClient) {
  return (db as PostgresDb).getPool()
}

export async function findLessonsByModuleId(db: DatabaseClient, moduleId: number | string): Promise<LessonRow[]> {
  if (db.backend !== 'postgres') {
    return db.all<LessonRow>('SELECT * FROM lessons WHERE module_id = ? ORDER BY id', [moduleId])
  }

  return getQueryDatabase(pool(db))
    .selectFrom('lessons')
    .selectAll()
    .where('module_id', '=', Number(moduleId))
    .orderBy('id')
    .execute()
}

export async function findLessonById(db: DatabaseClient, id: number | string): Promise<LessonRow | undefined> {
  if (db.backend !== 'postgres') {
    return db.get<LessonRow>('SELECT * FROM lessons WHERE id = ?', [id])
  }

  return getQueryDatabase(pool(db))
    .selectFrom('lessons')
    .selectAll()
    .where('id', '=', Number(id))
    .executeTakeFirst()
}

const SQLITE_LESSON_WITH_ROADMAP_ID = `
  SELECT lessons.*, modules.roadmap_id
  FROM lessons
  INNER JOIN modules ON modules.id = lessons.module_id
  WHERE lessons.id = ?
`

export async function findLessonWithRoadmapId(db: DatabaseClient, id: number | string): Promise<LessonWithRoadmapId | undefined> {
  if (db.backend !== 'postgres') {
    return db.get<LessonWithRoadmapId>(SQLITE_LESSON_WITH_ROADMAP_ID, [id])
  }

  return getQueryDatabase(pool(db))
    .selectFrom('lessons')
    .innerJoin('modules', 'modules.id', 'lessons.module_id')
    .select([
      'lessons.id',
      'lessons.module_id',
      'lessons.title',
      'lessons.completed',
      'modules.roadmap_id'
    ])
    .where('lessons.id', '=', Number(id))
    .executeTakeFirst() as Promise<LessonWithRoadmapId | undefined>
}

export async function insertLesson(db: DatabaseClient, data: { module_id: number; title: string }): Promise<number> {
  if (db.backend !== 'postgres') {
    const result = await db.run(
      'INSERT INTO lessons (module_id, title, completed) VALUES (?, ?, ?)',
      [data.module_id, data.title, 0]
    )
    return result.lastID as number
  }

  const inserted = await getQueryDatabase(pool(db))
    .insertInto('lessons')
    .values({ module_id: data.module_id, title: data.title, completed: 0 })
    .returning('id')
    .executeTakeFirstOrThrow()
  return inserted.id
}

export async function updateLesson(db: DatabaseClient, id: number | string, data: { title: string; completed: boolean }): Promise<number> {
  if (db.backend !== 'postgres') {
    const result = await db.run(
      'UPDATE lessons SET title = ?, completed = ? WHERE id = ?',
      [data.title, data.completed ? 1 : 0, id]
    )
    return result.changes ?? 0
  }

  const result = await getQueryDatabase(pool(db))
    .updateTable('lessons')
    .set({ title: data.title, completed: data.completed ? 1 : 0 })
    .where('id', '=', Number(id))
    .executeTakeFirst()

  return Number(result.numUpdatedRows ?? 0)
}

export async function deleteLesson(db: DatabaseClient, id: number | string): Promise<number> {
  if (db.backend !== 'postgres') {
    const result = await db.run('DELETE FROM lessons WHERE id = ?', [id])
    return result.changes ?? 0
  }

  const result = await getQueryDatabase(pool(db))
    .deleteFrom('lessons')
    .where('id', '=', Number(id))
    .executeTakeFirst()

  return Number(result.numDeletedRows ?? 0)
}
