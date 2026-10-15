import { sql } from 'kysely'
import type { DatabaseClient } from '../../../persistence/database'
import type { PostgresDb } from '../../../persistence/postgresDb'
import { getQueryDatabase } from '../../../persistence/kyselyDatabase'
import { clampTimeSpent, percentageValue, progressPercentage, resolveRoadmapStatus } from '../rules'
import type {
  LessonProgressUpdate,
  ModuleProgressStatus,
  RoadmapDetailProgress,
  RoadmapModuleProgressSummary,
  RoadmapProgressTouch,
  UserRoadmapProgressSummary
} from '../types'
import type { ProgressRepository } from '../ports'

type LessonContext = {
  lessonId: number
  moduleId: number
  roadmapId: number
  title: string
}

function nowIso() {
  return new Date().toISOString()
}

// Plain aggregate joins/counts, no CTE/window functions: reused verbatim for
// SQLite; for Postgres the raw SQL is passed through Kysely's `sql` tag so the
// exact same query shape (and its `datetime()`-free form, since Postgres
// timestamp columns need no wrapper) executes through the shared query
// database/connection pool.
async function getRoadmapProgressSnapshot(db: DatabaseClient, userId: number, roadmapId: number) {
  let totals: any
  let lessonCount: any

  if (db.backend !== 'postgres') {
    totals = await db.get(
      `SELECT
          COALESCE(SUM(user_lesson_progress.time_spent_seconds), 0) AS time_spent_seconds,
          COALESCE(SUM(CASE WHEN user_lesson_progress.completed_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS completed_lessons_count,
          (
            SELECT completed_at
            FROM user_roadmap_progress
            WHERE user_id = ? AND roadmap_id = ?
          ) AS completed_at
       FROM user_lesson_progress
       INNER JOIN lessons ON lessons.id = user_lesson_progress.lesson_id
       INNER JOIN modules ON modules.id = lessons.module_id
       WHERE user_lesson_progress.user_id = ?
         AND modules.roadmap_id = ?`,
      [userId, roadmapId, userId, roadmapId]
    )

    lessonCount = await db.get(
      `SELECT COUNT(*) AS count
       FROM lessons
       INNER JOIN modules ON modules.id = lessons.module_id
       WHERE modules.roadmap_id = ?`,
      [roadmapId]
    )
  } else {
    const kdb = getQueryDatabase((db as PostgresDb).getPool())

    const totalsResult = await sql<any>`
      SELECT
          COALESCE(SUM(user_lesson_progress.time_spent_seconds), 0) AS time_spent_seconds,
          COALESCE(SUM(CASE WHEN user_lesson_progress.completed_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS completed_lessons_count,
          (
            SELECT completed_at
            FROM user_roadmap_progress
            WHERE user_id = ${userId} AND roadmap_id = ${roadmapId}
          ) AS completed_at
       FROM user_lesson_progress
       INNER JOIN lessons ON lessons.id = user_lesson_progress.lesson_id
       INNER JOIN modules ON modules.id = lessons.module_id
       WHERE user_lesson_progress.user_id = ${userId}
         AND modules.roadmap_id = ${roadmapId}
    `.execute(kdb)
    totals = totalsResult.rows[0]

    const lessonCountResult = await sql<any>`
      SELECT COUNT(*) AS count
       FROM lessons
       INNER JOIN modules ON modules.id = lessons.module_id
       WHERE modules.roadmap_id = ${roadmapId}
    `.execute(kdb)
    lessonCount = lessonCountResult.rows[0]
  }

  const completedLessonsCount = Number(totals?.completed_lessons_count || 0)
  const totalLessons = Number(lessonCount?.count || 0)

  return {
    completedLessonsCount,
    timeSpentSeconds: Number(totals?.time_spent_seconds || 0),
    completedAt: totalLessons > 0 && completedLessonsCount >= totalLessons
      ? totals?.completed_at || nowIso()
      : null
  }
}

// Upsert with COALESCE self-references. Postgres supports the identical
// `ON CONFLICT (...) DO UPDATE SET col = EXCLUDED.col` syntax (case-insensitive
// keyword, unquoted `excluded` resolves the same as SQLite's), so the raw SQL
// is reused verbatim through the `sql` tag rather than reconstructed with the
// Kysely query builder, which cannot cleanly express a self-referential
// COALESCE against the upserted row's own pre-existing column.
export async function touchRoadmapProgress(db: DatabaseClient, options: RoadmapProgressTouch) {
  const now = nowIso()

  if (db.backend !== 'postgres') {
    const existing = await db.get(
      'SELECT * FROM user_roadmap_progress WHERE user_id = ? AND roadmap_id = ?',
      [options.userId, options.roadmapId]
    )

    const currentModuleId = options.moduleId === undefined ? existing?.current_module_id ?? null : options.moduleId
    const currentLessonId = options.lessonId === undefined ? existing?.current_lesson_id ?? null : options.lessonId
    const completedLessonsCount = options.completedLessonsCount ?? existing?.completed_lessons_count ?? 0
    const timeSpentSeconds = options.timeSpentSeconds ?? existing?.time_spent_seconds ?? 0
    const completedAt = options.completedAt === undefined ? existing?.completed_at ?? null : options.completedAt

    await db.run(
      `INSERT INTO user_roadmap_progress (
        user_id, roadmap_id, current_module_id, current_lesson_id, started_at,
        last_activity_at, completed_at, completed_lessons_count, time_spent_seconds,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, roadmap_id) DO UPDATE SET
        current_module_id = excluded.current_module_id,
        current_lesson_id = excluded.current_lesson_id,
        started_at = COALESCE(user_roadmap_progress.started_at, excluded.started_at),
        last_activity_at = excluded.last_activity_at,
        completed_at = excluded.completed_at,
        completed_lessons_count = excluded.completed_lessons_count,
        time_spent_seconds = excluded.time_spent_seconds,
        updated_at = excluded.updated_at`,
      [
        options.userId,
        options.roadmapId,
        currentModuleId,
        currentLessonId,
        now,
        now,
        completedAt,
        completedLessonsCount,
        timeSpentSeconds,
        now,
        now
      ]
    )
    return
  }

  const kdb = getQueryDatabase((db as PostgresDb).getPool())
  const existingResult = await sql<any>`
    SELECT * FROM user_roadmap_progress WHERE user_id = ${options.userId} AND roadmap_id = ${options.roadmapId}
  `.execute(kdb)
  const existing = existingResult.rows[0]

  const currentModuleId = options.moduleId === undefined ? existing?.current_module_id ?? null : options.moduleId
  const currentLessonId = options.lessonId === undefined ? existing?.current_lesson_id ?? null : options.lessonId
  const completedLessonsCount = options.completedLessonsCount ?? existing?.completed_lessons_count ?? 0
  const timeSpentSeconds = options.timeSpentSeconds ?? existing?.time_spent_seconds ?? 0
  const completedAt = options.completedAt === undefined ? existing?.completed_at ?? null : options.completedAt

  await sql`
    INSERT INTO user_roadmap_progress (
      user_id, roadmap_id, current_module_id, current_lesson_id, started_at,
      last_activity_at, completed_at, completed_lessons_count, time_spent_seconds,
      created_at, updated_at
    ) VALUES (
      ${options.userId}, ${options.roadmapId}, ${currentModuleId}, ${currentLessonId}, ${now},
      ${now}, ${completedAt}, ${completedLessonsCount}, ${timeSpentSeconds}, ${now}, ${now}
    )
    ON CONFLICT (user_id, roadmap_id) DO UPDATE SET
      current_module_id = excluded.current_module_id,
      current_lesson_id = excluded.current_lesson_id,
      started_at = COALESCE(user_roadmap_progress.started_at, excluded.started_at),
      last_activity_at = excluded.last_activity_at,
      completed_at = excluded.completed_at,
      completed_lessons_count = excluded.completed_lessons_count,
      time_spent_seconds = excluded.time_spent_seconds,
      updated_at = excluded.updated_at
  `.execute(kdb)
}

async function getLessonContext(db: DatabaseClient, lessonId: number): Promise<LessonContext | null> {
  let row: any

  if (db.backend !== 'postgres') {
    row = await db.get(
      `SELECT lessons.id AS lesson_id, lessons.title, lessons.module_id, modules.roadmap_id
       FROM lessons
       INNER JOIN modules ON modules.id = lessons.module_id
       WHERE lessons.id = ?`,
      [lessonId]
    )
  } else {
    const kdb = getQueryDatabase((db as PostgresDb).getPool())
    const result = await sql<any>`
      SELECT lessons.id AS lesson_id, lessons.title, lessons.module_id, modules.roadmap_id
       FROM lessons
       INNER JOIN modules ON modules.id = lessons.module_id
       WHERE lessons.id = ${lessonId}
    `.execute(kdb)
    row = result.rows[0]
  }

  if (!row) return null

  return {
    lessonId: row.lesson_id,
    title: row.title,
    moduleId: row.module_id,
    roadmapId: row.roadmap_id
  }
}

// Upsert with an accumulator (time_spent_seconds = table.col + excluded.col)
// plus a conditional CASE on completed_at. Same reasoning as
// touchRoadmapProgress: kept as raw SQL reused through the `sql` tag for
// Postgres, since Postgres's ON CONFLICT/EXCLUDED syntax matches SQLite's and
// the builder's `.doUpdateSet()` cannot express the accumulator/CASE cleanly.
export async function setLessonProgress(db: DatabaseClient, options: LessonProgressUpdate) {
  const lesson = await getLessonContext(db, options.lessonId)
  if (!lesson) return null

  const now = nowIso()
  const additionalTimeSpent = clampTimeSpent(options.timeSpentSeconds)

  let updated: any

  if (db.backend !== 'postgres') {
    await db.run(
      `INSERT INTO user_lesson_progress (
        user_id, lesson_id, started_at, last_activity_at, completed_at,
        time_spent_seconds, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, lesson_id) DO UPDATE SET
        started_at = COALESCE(user_lesson_progress.started_at, excluded.started_at),
        last_activity_at = excluded.last_activity_at,
        completed_at = CASE
          WHEN excluded.completed_at IS NULL THEN NULL
          ELSE COALESCE(user_lesson_progress.completed_at, excluded.completed_at)
        END,
        time_spent_seconds = user_lesson_progress.time_spent_seconds + excluded.time_spent_seconds,
        updated_at = excluded.updated_at`,
      [
        options.userId,
        options.lessonId,
        now,
        now,
        options.completed ? now : null,
        additionalTimeSpent,
        now,
        now
      ]
    )
    updated = await db.get(
      'SELECT * FROM user_lesson_progress WHERE user_id = ? AND lesson_id = ?',
      [options.userId, options.lessonId]
    )
  } else {
    const kdb = getQueryDatabase((db as PostgresDb).getPool())
    const completedAt = options.completed ? now : null

    await sql`
      INSERT INTO user_lesson_progress (
        user_id, lesson_id, started_at, last_activity_at, completed_at,
        time_spent_seconds, created_at, updated_at
      ) VALUES (
        ${options.userId}, ${options.lessonId}, ${now}, ${now}, ${completedAt},
        ${additionalTimeSpent}, ${now}, ${now}
      )
      ON CONFLICT (user_id, lesson_id) DO UPDATE SET
        started_at = COALESCE(user_lesson_progress.started_at, excluded.started_at),
        last_activity_at = excluded.last_activity_at,
        completed_at = CASE
          WHEN excluded.completed_at IS NULL THEN NULL
          ELSE COALESCE(user_lesson_progress.completed_at, excluded.completed_at)
        END,
        time_spent_seconds = user_lesson_progress.time_spent_seconds + excluded.time_spent_seconds,
        updated_at = excluded.updated_at
    `.execute(kdb)

    const result = await sql<any>`
      SELECT * FROM user_lesson_progress WHERE user_id = ${options.userId} AND lesson_id = ${options.lessonId}
    `.execute(kdb)
    updated = result.rows[0]
  }

  const startedAt = updated?.started_at || now
  const completedAt = updated?.completed_at ?? null
  const totalTimeSpent = Number(updated?.time_spent_seconds || 0)

  const snapshot = await getRoadmapProgressSnapshot(db, options.userId, lesson.roadmapId)
  await touchRoadmapProgress(db, {
    userId: options.userId,
    roadmapId: lesson.roadmapId,
    moduleId: lesson.moduleId,
    lessonId: lesson.lessonId,
    completedLessonsCount: snapshot.completedLessonsCount,
    timeSpentSeconds: snapshot.timeSpentSeconds,
    completedAt: snapshot.completedAt
  })

  return {
    lesson_id: lesson.lessonId,
    module_id: lesson.moduleId,
    roadmap_id: lesson.roadmapId,
    title: lesson.title,
    started_at: startedAt,
    last_activity_at: now,
    completed_at: completedAt,
    completed: options.completed ? 1 : 0,
    time_spent_seconds: totalTimeSpent,
    roadmap_completed_lessons_count: snapshot.completedLessonsCount,
    roadmap_time_spent_seconds: snapshot.timeSpentSeconds
  }
}

const SQLITE_LIST_USER_ROADMAP_PROGRESS = `
  WITH next_lessons AS (
     SELECT
       modules.roadmap_id,
       modules.id AS next_module_id,
       modules.title AS next_module_title,
       lessons.id AS next_lesson_id,
       lessons.title AS next_lesson_title,
       ROW_NUMBER() OVER (
         PARTITION BY modules.roadmap_id
         ORDER BY COALESCE(modules.position, modules.id), modules.id, lessons.id
       ) AS sequence
     FROM modules
     INNER JOIN lessons ON lessons.module_id = modules.id
     LEFT JOIN user_lesson_progress AS next_lesson_progress
       ON next_lesson_progress.lesson_id = lessons.id
      AND next_lesson_progress.user_id = ?
     WHERE next_lesson_progress.completed_at IS NULL
   )
   SELECT
      user_roadmap_progress.roadmap_id,
      roadmaps.title,
      roadmaps.description,
      roadmaps.duration,
      user_roadmap_progress.started_at,
      user_roadmap_progress.last_activity_at,
      user_roadmap_progress.completed_at,
      COALESCE(SUM(CASE WHEN user_lesson_progress.completed_at IS NOT NULL THEN 1 ELSE 0 END), 0)
        AS completed_lessons_count,
      COALESCE(SUM(user_lesson_progress.time_spent_seconds), 0) AS time_spent_seconds,
      user_roadmap_progress.current_module_id,
      current_module.title AS current_module_title,
      user_roadmap_progress.current_lesson_id,
      current_lesson.title AS current_lesson_title,
      next_lessons.next_module_id,
      next_lessons.next_module_title,
      next_lessons.next_lesson_id,
      next_lessons.next_lesson_title,
      (
        SELECT COUNT(*)
        FROM user_quiz_attempts
        WHERE user_quiz_attempts.user_id = ?
          AND user_quiz_attempts.roadmap_id = user_roadmap_progress.roadmap_id
      ) AS quiz_attempts_count,
      (
        SELECT AVG((score * 100.0) / max_score)
        FROM user_quiz_attempts
        WHERE user_quiz_attempts.user_id = ?
          AND user_quiz_attempts.roadmap_id = user_roadmap_progress.roadmap_id
          AND max_score > 0
      ) AS average_quiz_percentage,
      (
        SELECT MAX((score * 100.0) / max_score)
        FROM user_quiz_attempts
        WHERE user_quiz_attempts.user_id = ?
          AND user_quiz_attempts.roadmap_id = user_roadmap_progress.roadmap_id
          AND max_score > 0
      ) AS best_quiz_percentage,
      (
        SELECT (score * 100.0) / max_score
        FROM user_quiz_attempts
        WHERE user_quiz_attempts.user_id = ?
          AND user_quiz_attempts.roadmap_id = user_roadmap_progress.roadmap_id
          AND max_score > 0
        ORDER BY datetime(submitted_at) DESC, id DESC
        LIMIT 1
      ) AS last_quiz_percentage,
      COUNT(DISTINCT modules.id) AS total_modules,
      COUNT(lessons.id) AS total_lessons
   FROM user_roadmap_progress
   INNER JOIN roadmaps ON roadmaps.id = user_roadmap_progress.roadmap_id
   LEFT JOIN modules ON modules.roadmap_id = roadmaps.id
   LEFT JOIN lessons ON lessons.module_id = modules.id
   LEFT JOIN user_lesson_progress
     ON user_lesson_progress.lesson_id = lessons.id
    AND user_lesson_progress.user_id = ?
   LEFT JOIN modules AS current_module ON current_module.id = user_roadmap_progress.current_module_id
   LEFT JOIN lessons AS current_lesson ON current_lesson.id = user_roadmap_progress.current_lesson_id
   LEFT JOIN next_lessons
     ON next_lessons.roadmap_id = user_roadmap_progress.roadmap_id
    AND next_lessons.sequence = 1
   WHERE user_roadmap_progress.user_id = ?
   GROUP BY
     user_roadmap_progress.id,
     roadmaps.title,
     roadmaps.description,
     roadmaps.duration,
     current_module.title,
     current_lesson.title,
     next_lessons.next_module_id,
     next_lessons.next_module_title,
     next_lessons.next_lesson_id,
     next_lessons.next_lesson_title
   ORDER BY datetime(user_roadmap_progress.last_activity_at) DESC, user_roadmap_progress.id DESC
`

// Highest-risk query: CTE + window function (ROW_NUMBER OVER PARTITION BY) +
// four correlated scalar subqueries. Reused verbatim for SQLite. For
// Postgres this is translated (not reconstructed with the query builder,
// which cannot express window functions/CTEs cleanly) and passed through
// Kysely's `sql` tag, still routed through getQueryDatabase(pool) for
// connection/instance reuse. Two changes from the SQLite text:
//   1. `datetime(x)` wrappers are dropped: user_roadmap_progress.last_activity_at
//      and user_quiz_attempts.submitted_at are native TIMESTAMPTZ columns in the
//      Postgres schema (see lib/postgresDb.ts), so plain `ORDER BY column DESC`
//      is already correct — SQLite's datetime() was only needed there because
//      SQLite stores these as ISO TEXT.
//   2. Positional `?` params become interpolated `sql` template values (Kysely
//      compiles these to parameterized `$n` placeholders, so this remains a
//      parameterized query, not string concatenation).
async function listUserRoadmapProgressPostgres(db: PostgresDb, userId: number) {
  const kdb = getQueryDatabase(db.getPool())

  const result = await sql<any>`
    WITH next_lessons AS (
       SELECT
         modules.roadmap_id,
         modules.id AS next_module_id,
         modules.title AS next_module_title,
         lessons.id AS next_lesson_id,
         lessons.title AS next_lesson_title,
         ROW_NUMBER() OVER (
           PARTITION BY modules.roadmap_id
           ORDER BY COALESCE(modules.position, modules.id), modules.id, lessons.id
         ) AS sequence
       FROM modules
       INNER JOIN lessons ON lessons.module_id = modules.id
       LEFT JOIN user_lesson_progress AS next_lesson_progress
         ON next_lesson_progress.lesson_id = lessons.id
        AND next_lesson_progress.user_id = ${userId}
       WHERE next_lesson_progress.completed_at IS NULL
     )
     SELECT
        user_roadmap_progress.roadmap_id,
        roadmaps.title,
        roadmaps.description,
        roadmaps.duration,
        user_roadmap_progress.started_at,
        user_roadmap_progress.last_activity_at,
        user_roadmap_progress.completed_at,
        COALESCE(SUM(CASE WHEN user_lesson_progress.completed_at IS NOT NULL THEN 1 ELSE 0 END), 0)
          AS completed_lessons_count,
        COALESCE(SUM(user_lesson_progress.time_spent_seconds), 0) AS time_spent_seconds,
        user_roadmap_progress.current_module_id,
        current_module.title AS current_module_title,
        user_roadmap_progress.current_lesson_id,
        current_lesson.title AS current_lesson_title,
        next_lessons.next_module_id,
        next_lessons.next_module_title,
        next_lessons.next_lesson_id,
        next_lessons.next_lesson_title,
        (
          SELECT COUNT(*)
          FROM user_quiz_attempts
          WHERE user_quiz_attempts.user_id = ${userId}
            AND user_quiz_attempts.roadmap_id = user_roadmap_progress.roadmap_id
        ) AS quiz_attempts_count,
        (
          SELECT AVG((score * 100.0) / max_score)
          FROM user_quiz_attempts
          WHERE user_quiz_attempts.user_id = ${userId}
            AND user_quiz_attempts.roadmap_id = user_roadmap_progress.roadmap_id
            AND max_score > 0
        ) AS average_quiz_percentage,
        (
          SELECT MAX((score * 100.0) / max_score)
          FROM user_quiz_attempts
          WHERE user_quiz_attempts.user_id = ${userId}
            AND user_quiz_attempts.roadmap_id = user_roadmap_progress.roadmap_id
            AND max_score > 0
        ) AS best_quiz_percentage,
        (
          SELECT (score * 100.0) / max_score
          FROM user_quiz_attempts
          WHERE user_quiz_attempts.user_id = ${userId}
            AND user_quiz_attempts.roadmap_id = user_roadmap_progress.roadmap_id
            AND max_score > 0
          ORDER BY submitted_at DESC, id DESC
          LIMIT 1
        ) AS last_quiz_percentage,
        COUNT(DISTINCT modules.id) AS total_modules,
        COUNT(lessons.id) AS total_lessons
     FROM user_roadmap_progress
     INNER JOIN roadmaps ON roadmaps.id = user_roadmap_progress.roadmap_id
     LEFT JOIN modules ON modules.roadmap_id = roadmaps.id
     LEFT JOIN lessons ON lessons.module_id = modules.id
     LEFT JOIN user_lesson_progress
       ON user_lesson_progress.lesson_id = lessons.id
      AND user_lesson_progress.user_id = ${userId}
     LEFT JOIN modules AS current_module ON current_module.id = user_roadmap_progress.current_module_id
     LEFT JOIN lessons AS current_lesson ON current_lesson.id = user_roadmap_progress.current_lesson_id
     LEFT JOIN next_lessons
       ON next_lessons.roadmap_id = user_roadmap_progress.roadmap_id
      AND next_lessons.sequence = 1
     WHERE user_roadmap_progress.user_id = ${userId}
     GROUP BY
       user_roadmap_progress.id,
       roadmaps.title,
       roadmaps.description,
       roadmaps.duration,
       current_module.title,
       current_lesson.title,
       next_lessons.next_module_id,
       next_lessons.next_module_title,
       next_lessons.next_lesson_id,
       next_lessons.next_lesson_title
     ORDER BY user_roadmap_progress.last_activity_at DESC, user_roadmap_progress.id DESC
  `.execute(kdb)

  return result.rows
}

export async function listUserRoadmapProgress(db: DatabaseClient, userId: number): Promise<UserRoadmapProgressSummary[]> {
  const rows = db.backend !== 'postgres'
    ? await db.all(SQLITE_LIST_USER_ROADMAP_PROGRESS, [userId, userId, userId, userId, userId, userId, userId])
    : await listUserRoadmapProgressPostgres(db as PostgresDb, userId)

  return rows.map((row: any) => {
    const totalLessons = Number(row.total_lessons || 0)
    const completedLessonsCount = Number(row.completed_lessons_count || 0)
    const percentage = progressPercentage(completedLessonsCount, totalLessons)
    const status = resolveRoadmapStatus({
      completedAt: row.completed_at,
      completedLessonsCount,
      totalLessons,
      currentModuleId: row.current_module_id,
      lastActivityAt: row.last_activity_at
    })
    const nextModuleId = row.next_module_id ?? row.current_module_id
    const nextHref = status === 'completed'
      ? `/roadmaps/${row.roadmap_id}`
      : nextModuleId
        ? `/modules/${nextModuleId}`
        : `/roadmaps/${row.roadmap_id}`
    const nextStepLabel = status === 'completed'
      ? 'Volver al roadmap'
      : row.next_lesson_title
        ? `Continuar con ${row.next_lesson_title}`
        : row.next_module_title || row.current_module_title
          ? `Continuar con ${row.next_module_title || row.current_module_title}`
          : 'Retomar roadmap'

    return {
      roadmap_id: row.roadmap_id,
      title: row.title,
      description: row.description,
      duration: row.duration,
      started_at: row.started_at,
      last_activity_at: row.last_activity_at,
      completed_at: status === 'completed' ? row.completed_at : null,
      completed_lessons_count: completedLessonsCount,
      total_lessons: totalLessons,
      total_modules: Number(row.total_modules || 0),
      time_spent_seconds: Number(row.time_spent_seconds || 0),
      current_module_id: row.current_module_id,
      current_module_title: row.current_module_title,
      current_lesson_id: row.current_lesson_id,
      current_lesson_title: row.current_lesson_title,
      progress_percentage: percentage,
      status,
      next_href: nextHref,
      next_step_label: nextStepLabel,
      quiz_attempts_count: Number(row.quiz_attempts_count || 0),
      average_quiz_percentage: percentageValue(row.average_quiz_percentage),
      best_quiz_percentage: percentageValue(row.best_quiz_percentage),
      last_quiz_percentage: percentageValue(row.last_quiz_percentage)
    } as UserRoadmapProgressSummary
  })
}

// Plain joins/aggregates, no CTE/window functions: migrated with the standard
// Kysely query builder for Postgres, SQL reused verbatim for SQLite.
export async function getRoadmapDetailProgress(
  db: DatabaseClient,
  userId: number,
  roadmapId: number
): Promise<RoadmapDetailProgress> {
  let progressRow: any
  let moduleRows: any[]
  let lessonRows: any[]

  if (db.backend !== 'postgres') {
    progressRow = await db.get(
      `SELECT
          user_roadmap_progress.*,
          current_module.title AS current_module_title,
          current_lesson.title AS current_lesson_title
       FROM user_roadmap_progress
       LEFT JOIN modules AS current_module
         ON current_module.id = user_roadmap_progress.current_module_id
       LEFT JOIN lessons AS current_lesson
         ON current_lesson.id = user_roadmap_progress.current_lesson_id
       WHERE user_roadmap_progress.user_id = ?
         AND user_roadmap_progress.roadmap_id = ?`,
      [userId, roadmapId]
    )

    moduleRows = await db.all(
      `SELECT
          modules.id AS module_id,
          modules.title,
          modules.position,
          COUNT(lessons.id) AS total_lessons,
          COALESCE(SUM(CASE WHEN user_lesson_progress.completed_at IS NOT NULL THEN 1 ELSE 0 END), 0)
            AS completed_lessons_count,
          MAX(user_lesson_progress.last_activity_at) AS last_activity_at
       FROM modules
       LEFT JOIN lessons ON lessons.module_id = modules.id
       LEFT JOIN user_lesson_progress
         ON user_lesson_progress.lesson_id = lessons.id
        AND user_lesson_progress.user_id = ?
       WHERE modules.roadmap_id = ?
       GROUP BY modules.id, modules.title, modules.position
       ORDER BY COALESCE(modules.position, modules.id), modules.id`,
      [userId, roadmapId]
    )

    lessonRows = await db.all(
      `SELECT
          lessons.id AS lesson_id,
          lessons.title AS lesson_title,
          lessons.module_id,
          modules.title AS module_title,
          CASE WHEN user_lesson_progress.completed_at IS NOT NULL THEN 1 ELSE 0 END AS completed,
          COALESCE(user_lesson_progress.time_spent_seconds, 0) AS time_spent_seconds
       FROM lessons
       INNER JOIN modules ON modules.id = lessons.module_id
       LEFT JOIN user_lesson_progress
         ON user_lesson_progress.lesson_id = lessons.id
        AND user_lesson_progress.user_id = ?
       WHERE modules.roadmap_id = ?
       ORDER BY COALESCE(modules.position, modules.id), modules.id, lessons.id`,
      [userId, roadmapId]
    )
  } else {
    const kdb = getQueryDatabase((db as PostgresDb).getPool())

    progressRow = await kdb
      .selectFrom('user_roadmap_progress')
      .leftJoin('modules as current_module', 'current_module.id', 'user_roadmap_progress.current_module_id')
      .leftJoin('lessons as current_lesson', 'current_lesson.id', 'user_roadmap_progress.current_lesson_id')
      .select([
        'user_roadmap_progress.roadmap_id',
        'user_roadmap_progress.started_at',
        'user_roadmap_progress.last_activity_at',
        'user_roadmap_progress.completed_at',
        'user_roadmap_progress.current_module_id',
        'user_roadmap_progress.current_lesson_id',
        'current_module.title as current_module_title',
        'current_lesson.title as current_lesson_title'
      ])
      .where('user_roadmap_progress.user_id', '=', userId)
      .where('user_roadmap_progress.roadmap_id', '=', roadmapId)
      .executeTakeFirst()

    moduleRows = await kdb
      .selectFrom('modules')
      .leftJoin('lessons', 'lessons.module_id', 'modules.id')
      .leftJoin('user_lesson_progress', join => join
        .onRef('user_lesson_progress.lesson_id', '=', 'lessons.id')
        .on('user_lesson_progress.user_id', '=', userId))
      .select(eb => [
        'modules.id as module_id',
        'modules.title',
        'modules.position',
        eb.fn.count('lessons.id').as('total_lessons'),
        eb.fn.sum(
          eb.case().when('user_lesson_progress.completed_at', 'is not', null).then(1).else(0).end()
        ).as('completed_lessons_count'),
        eb.fn.max('user_lesson_progress.last_activity_at').as('last_activity_at')
      ])
      .where('modules.roadmap_id', '=', roadmapId)
      .groupBy(['modules.id', 'modules.title', 'modules.position'])
      .orderBy(sql`coalesce(modules.position, modules.id)`)
      .orderBy('modules.id')
      .execute()

    lessonRows = await kdb
      .selectFrom('lessons')
      .innerJoin('modules', 'modules.id', 'lessons.module_id')
      .leftJoin('user_lesson_progress', join => join
        .onRef('user_lesson_progress.lesson_id', '=', 'lessons.id')
        .on('user_lesson_progress.user_id', '=', userId))
      .select(eb => [
        'lessons.id as lesson_id',
        'lessons.title as lesson_title',
        'lessons.module_id',
        'modules.title as module_title',
        eb.case().when('user_lesson_progress.completed_at', 'is not', null).then(1).else(0).end().as('completed'),
        sql<number>`coalesce(user_lesson_progress.time_spent_seconds, 0)`.as('time_spent_seconds')
      ])
      .where('modules.roadmap_id', '=', roadmapId)
      .orderBy(sql`coalesce(modules.position, modules.id)`)
      .orderBy('modules.id')
      .orderBy('lessons.id')
      .execute()
  }

  const lessonsByModule = new Map<number, any[]>()
  lessonRows.forEach((lesson: any) => {
    const moduleId = Number(lesson.module_id)
    const items = lessonsByModule.get(moduleId) || []
    items.push(lesson)
    lessonsByModule.set(moduleId, items)
  })

  const moduleSummaries = moduleRows.map((row: any) => {
    const moduleId = Number(row.module_id)
    const moduleLessons = lessonsByModule.get(moduleId) || []
    const totalLessons = Number(row.total_lessons || 0)
    const completedLessonsCount = Number(row.completed_lessons_count || 0)
    const isCurrentModule = Number(progressRow?.current_module_id || 0) === moduleId
    const hasActivity = Boolean(row.last_activity_at) || isCurrentModule || completedLessonsCount > 0
    const status: ModuleProgressStatus = totalLessons > 0 && completedLessonsCount >= totalLessons
      ? 'completed'
      : hasActivity
        ? 'in_progress'
        : 'not_started'
    const nextLesson = moduleLessons.find((lesson: any) => Number(lesson.completed) !== 1)

    return {
      module_id: moduleId,
      title: row.title,
      position: row.position,
      total_lessons: totalLessons,
      completed_lessons_count: completedLessonsCount,
      progress_percentage: progressPercentage(completedLessonsCount, totalLessons),
      status,
      last_activity_at: row.last_activity_at,
      next_lesson_id: nextLesson?.lesson_id ?? null,
      next_lesson_title: nextLesson?.lesson_title ?? null
    } as RoadmapModuleProgressSummary
  })

  const totalLessons = moduleSummaries.reduce((sum, module) => sum + module.total_lessons, 0)
  const completedLessonsCount = moduleSummaries.reduce((sum, module) => sum + module.completed_lessons_count, 0)
  const timeSpentSeconds = lessonRows.reduce((sum: number, lesson: any) => (
    sum + Number(lesson.time_spent_seconds || 0)
  ), 0)
  const completed = totalLessons > 0 && completedLessonsCount >= totalLessons
  const nextModule = moduleSummaries.find(module => module.status !== 'completed') || moduleSummaries[0]
  const nextHref = completed
    ? `/roadmaps/${roadmapId}`
    : nextModule
      ? `/modules/${nextModule.module_id}`
      : `/roadmaps/${roadmapId}`
  const nextStepLabel = completed
    ? 'Roadmap completado'
    : nextModule?.next_lesson_title
      ? `Continuar con ${nextModule.next_lesson_title}`
      : nextModule
        ? `Abrir ${nextModule.title}`
        : 'Revisar roadmap'
  const status = resolveRoadmapStatus({
    completedAt: progressRow?.completed_at,
    completedLessonsCount,
    totalLessons,
    currentModuleId: progressRow?.current_module_id,
    lastActivityAt: progressRow?.last_activity_at
  })

  return {
    roadmap_id: roadmapId,
    started_at: progressRow?.started_at ?? null,
    last_activity_at: progressRow?.last_activity_at ?? null,
    completed_at: status === 'completed' ? progressRow?.completed_at ?? null : null,
    completed_lessons_count: completedLessonsCount,
    total_lessons: totalLessons,
    total_modules: moduleSummaries.length,
    time_spent_seconds: timeSpentSeconds,
    current_module_id: progressRow?.current_module_id ?? null,
    current_module_title: progressRow?.current_module_title ?? null,
    current_lesson_id: progressRow?.current_lesson_id ?? null,
    current_lesson_title: progressRow?.current_lesson_title ?? null,
    progress_percentage: progressPercentage(completedLessonsCount, totalLessons),
    status,
    next_href: nextHref,
    next_step_label: nextStepLabel,
    modules: moduleSummaries
  }
}

export function createProgressRepository(db: DatabaseClient): ProgressRepository {
  return {
    touchRoadmapProgress: options => touchRoadmapProgress(db, options),
    setLessonProgress: options => setLessonProgress(db, options),
    listUserRoadmapProgress: userId => listUserRoadmapProgress(db, userId),
    getRoadmapDetailProgress: (userId, roadmapId) => getRoadmapDetailProgress(db, userId, roadmapId)
  }
}
