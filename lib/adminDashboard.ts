import { sql } from 'kysely'
import type { DatabaseClient } from './persistence/database'
import type { PostgresDb } from './persistence/postgresDb'
import { getQueryDatabase } from './persistence/kyselyDatabase'
import { ROADMAP_PAUSED_AFTER_DAYS } from './domains/progress/constants'

function pool(db: DatabaseClient) {
  return (db as PostgresDb).getPool()
}

export type AdminDashboardData = {
  generated_at: string
  active_window_days: number
  paused_after_days: number
  overview: {
    total_users: number
    active_users: number
    started_roadmaps: number
    completed_roadmaps: number
    submitted_evidences: number
    stalled_users: number
  }
  popular_roadmaps: Array<{
    roadmap_id: number
    title: string
    learners_count: number
    active_learners_count: number
    completed_learners_count: number
  }>
  completed_modules: Array<{
    module_id: number
    title: string
    roadmap_id: number
    roadmap_title: string
    total_lessons: number
    learners_count: number
    completed_learners_count: number
  }>
  stalled_learners: Array<{
    user_id: number
    email: string
    name?: string | null
    roadmap_id: number
    roadmap_title: string
    current_module_title?: string | null
    completed_lessons_count: number
    total_lessons: number
    progress_percentage: number
    last_activity_at: string
    inactivity_days: number
  }>
}

const ACTIVE_WINDOW_DAYS = 30

function isoDaysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

const learnerProgressCte = `
  WITH learner_progress AS (
    SELECT
      urp.user_id,
      urp.roadmap_id,
      urp.current_module_id,
      urp.last_activity_at,
      COUNT(lessons.id) AS total_lessons,
      COALESCE(SUM(CASE WHEN ulp.completed_at IS NOT NULL THEN 1 ELSE 0 END), 0)
        AS completed_lessons_count
    FROM user_roadmap_progress urp
    INNER JOIN users AS learner_user
      ON learner_user.id = urp.user_id
     AND learner_user.role = 'user'
    LEFT JOIN modules ON modules.roadmap_id = urp.roadmap_id
    LEFT JOIN lessons ON lessons.module_id = modules.id
    LEFT JOIN user_lesson_progress ulp
      ON ulp.lesson_id = lessons.id
     AND ulp.user_id = urp.user_id
    GROUP BY urp.user_id, urp.roadmap_id
  )
`

export async function getAdminDashboard(
  db: DatabaseClient,
  options: { now?: Date } = {}
): Promise<AdminDashboardData> {
  const now = options.now || new Date()
  const generatedAt = now.toISOString()
  const activeSince = isoDaysAgo(now, ACTIVE_WINDOW_DAYS)
  const pausedBefore = isoDaysAgo(now, ROADMAP_PAUSED_AFTER_DAYS)

  const [overviewRow, popularRoadmaps, completedModules, stalledLearners] = db.backend !== 'postgres'
    ? await getAdminDashboardRowsSqlite(db, { generatedAt, activeSince, pausedBefore })
    : await getAdminDashboardRowsPostgres(db as PostgresDb, { generatedAt, activeSince, pausedBefore })

  return {
    generated_at: generatedAt,
    active_window_days: ACTIVE_WINDOW_DAYS,
    paused_after_days: ROADMAP_PAUSED_AFTER_DAYS,
    overview: {
      total_users: Number(overviewRow?.total_users || 0),
      active_users: Number(overviewRow?.active_users || 0),
      started_roadmaps: Number(overviewRow?.started_roadmaps || 0),
      completed_roadmaps: Number(overviewRow?.completed_roadmaps || 0),
      submitted_evidences: Number(overviewRow?.submitted_evidences || 0),
      stalled_users: Number(overviewRow?.stalled_users || 0)
    },
    popular_roadmaps: popularRoadmaps.map(row => ({
      ...row,
      roadmap_id: Number(row.roadmap_id),
      learners_count: Number(row.learners_count),
      active_learners_count: Number(row.active_learners_count),
      completed_learners_count: Number(row.completed_learners_count)
    })),
    completed_modules: completedModules.map(row => ({
      ...row,
      module_id: Number(row.module_id),
      roadmap_id: Number(row.roadmap_id),
      total_lessons: Number(row.total_lessons),
      learners_count: Number(row.learners_count),
      completed_learners_count: Number(row.completed_learners_count)
    })),
    stalled_learners: stalledLearners.map(row => ({
      ...row,
      user_id: Number(row.user_id),
      roadmap_id: Number(row.roadmap_id),
      completed_lessons_count: Number(row.completed_lessons_count),
      total_lessons: Number(row.total_lessons),
      progress_percentage: Number(row.progress_percentage),
      inactivity_days: Number(row.inactivity_days)
    }))
  }
}

type DashboardQueryWindow = { generatedAt: string; activeSince: string; pausedBefore: string }

// Three CTEs total (one shared `learner_progress` reused by three queries,
// plus two more scoped to the completed-modules query), HAVING clauses that
// reference an aggregate SELECT alias, and one SQLite-only `julianday()` date
// diff. Kysely's query builder cannot cleanly express any of the three, so
// (same "minimize translation risk" reasoning as
// `listUserRoadmapProgress` in progressRepository.ts) the Postgres branch
// keeps the SQL shape intact and passes it through Kysely's `sql` template
// tag, still routed through getQueryDatabase(pool(db)) for connection/
// instance reuse. The only real translations are:
//   1. `julianday(?) - julianday(x)` -> the equivalent Postgres day-diff,
//      computed as `EXTRACT(EPOCH FROM (a::timestamptz - b)) / 86400`,
//      floored to match SQLite's `CAST(... AS INTEGER)` truncation-toward-
//      zero behavior for the positive day counts this query produces.
//   2. Nothing else needs translating: `is_active` is an INTEGER column in
//      both the SQLite and Postgres schemas (see lib/postgresDb.ts and the
//      established `is_active = 1` idiom already used verbatim against
//      Postgres in lib/userRepository.ts and lib/auth.ts), so `is_active = 1`
//      is reused as-is rather than rewritten to `= true`.
async function getAdminDashboardRowsPostgres(db: PostgresDb, window: DashboardQueryWindow) {
  const kdb = getQueryDatabase(pool(db))
  const { generatedAt, activeSince, pausedBefore } = window

  const overviewResult = await sql<any>`
    ${learnerProgressCteSql}
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'user' AND is_active = 1) AS total_users,
      COUNT(DISTINCT CASE
        WHEN users.is_active = 1 AND learner_progress.last_activity_at >= ${activeSince}
        THEN learner_progress.user_id
      END) AS active_users,
      COUNT(*) AS started_roadmaps,
      COALESCE(SUM(CASE
        WHEN learner_progress.total_lessons > 0
         AND learner_progress.completed_lessons_count >= learner_progress.total_lessons
        THEN 1 ELSE 0
      END), 0) AS completed_roadmaps,
      (SELECT COUNT(*) FROM user_module_evidences) AS submitted_evidences,
      COUNT(DISTINCT CASE
        WHEN users.is_active = 1
         AND learner_progress.last_activity_at <= ${pausedBefore}
         AND (
           learner_progress.total_lessons = 0
           OR learner_progress.completed_lessons_count < learner_progress.total_lessons
         )
        THEN learner_progress.user_id
      END) AS stalled_users
    FROM learner_progress
    INNER JOIN users ON users.id = learner_progress.user_id
  `.execute(kdb)
  const overviewRow = overviewResult.rows[0]

  const popularRoadmapsResult = await sql<any>`
    ${learnerProgressCteSql}
    SELECT
      roadmaps.id AS roadmap_id,
      roadmaps.title,
      COUNT(learner_progress.user_id) AS learners_count,
      COALESCE(SUM(CASE
        WHEN learner_progress.last_activity_at >= ${activeSince} THEN 1 ELSE 0
      END), 0) AS active_learners_count,
      COALESCE(SUM(CASE
        WHEN learner_progress.total_lessons > 0
         AND learner_progress.completed_lessons_count >= learner_progress.total_lessons
        THEN 1 ELSE 0
      END), 0) AS completed_learners_count
    FROM roadmaps
    LEFT JOIN learner_progress ON learner_progress.roadmap_id = roadmaps.id
    GROUP BY roadmaps.id
    HAVING COUNT(learner_progress.user_id) > 0
    ORDER BY learners_count DESC, active_learners_count DESC, roadmaps.title
    LIMIT 5
  `.execute(kdb)

  const completedModulesResult = await sql<any>`
    WITH module_progress AS (
      SELECT
        modules.id AS module_id,
        ulp.user_id,
        COUNT(lessons.id) AS total_lessons,
        SUM(CASE WHEN ulp.completed_at IS NOT NULL THEN 1 ELSE 0 END)
          AS completed_lessons_count
      FROM modules
      INNER JOIN lessons ON lessons.module_id = modules.id
      INNER JOIN user_lesson_progress ulp ON ulp.lesson_id = lessons.id
      INNER JOIN users AS learner_user
        ON learner_user.id = ulp.user_id
       AND learner_user.role = 'user'
      GROUP BY modules.id, ulp.user_id
    ),
    module_totals AS (
      SELECT module_id, COUNT(*) AS total_lessons
      FROM lessons
      GROUP BY module_id
    )
    SELECT
      modules.id AS module_id,
      modules.title,
      roadmaps.id AS roadmap_id,
      roadmaps.title AS roadmap_title,
      module_totals.total_lessons,
      COUNT(module_progress.user_id) AS learners_count,
      COALESCE(SUM(CASE
        WHEN module_progress.completed_lessons_count >= module_totals.total_lessons
        THEN 1 ELSE 0
      END), 0) AS completed_learners_count
    FROM modules
    INNER JOIN roadmaps ON roadmaps.id = modules.roadmap_id
    INNER JOIN module_totals ON module_totals.module_id = modules.id
    LEFT JOIN module_progress ON module_progress.module_id = modules.id
    GROUP BY modules.id, modules.title, roadmaps.id, roadmaps.title, module_totals.total_lessons
    HAVING COALESCE(SUM(CASE
      WHEN module_progress.completed_lessons_count >= module_totals.total_lessons
      THEN 1 ELSE 0
    END), 0) > 0
    ORDER BY completed_learners_count DESC, learners_count DESC, modules.title
    LIMIT 5
  `.execute(kdb)

  const stalledLearnersResult = await sql<any>`
    ${learnerProgressCteSql}
    SELECT
      users.id AS user_id,
      users.email,
      users.name,
      roadmaps.id AS roadmap_id,
      roadmaps.title AS roadmap_title,
      current_module.title AS current_module_title,
      learner_progress.completed_lessons_count,
      learner_progress.total_lessons,
      CASE
        WHEN learner_progress.total_lessons > 0
        THEN ROUND(learner_progress.completed_lessons_count * 100.0 / learner_progress.total_lessons)
        ELSE 0
      END AS progress_percentage,
      learner_progress.last_activity_at,
      FLOOR(
        EXTRACT(EPOCH FROM (${generatedAt}::timestamptz - learner_progress.last_activity_at)) / 86400
      )::INTEGER AS inactivity_days
    FROM learner_progress
    INNER JOIN users ON users.id = learner_progress.user_id
    INNER JOIN roadmaps ON roadmaps.id = learner_progress.roadmap_id
    LEFT JOIN modules AS current_module ON current_module.id = learner_progress.current_module_id
    WHERE users.is_active = 1
      AND learner_progress.last_activity_at <= ${pausedBefore}
      AND (
        learner_progress.total_lessons = 0
        OR learner_progress.completed_lessons_count < learner_progress.total_lessons
      )
    ORDER BY inactivity_days DESC, users.email, roadmaps.title
    LIMIT 10
  `.execute(kdb)

  return [overviewRow, popularRoadmapsResult.rows, completedModulesResult.rows, stalledLearnersResult.rows] as const
}

const learnerProgressCteSql = sql`
  WITH learner_progress AS (
    SELECT
      urp.user_id,
      urp.roadmap_id,
      urp.current_module_id,
      urp.last_activity_at,
      COUNT(lessons.id) AS total_lessons,
      COALESCE(SUM(CASE WHEN ulp.completed_at IS NOT NULL THEN 1 ELSE 0 END), 0)
        AS completed_lessons_count
    FROM user_roadmap_progress urp
    INNER JOIN users AS learner_user
      ON learner_user.id = urp.user_id
     AND learner_user.role = 'user'
    LEFT JOIN modules ON modules.roadmap_id = urp.roadmap_id
    LEFT JOIN lessons ON lessons.module_id = modules.id
    LEFT JOIN user_lesson_progress ulp
      ON ulp.lesson_id = lessons.id
     AND ulp.user_id = urp.user_id
    GROUP BY urp.user_id, urp.roadmap_id, urp.current_module_id, urp.last_activity_at
  )
`

async function getAdminDashboardRowsSqlite(db: DatabaseClient, window: DashboardQueryWindow) {
  const { generatedAt, activeSince, pausedBefore } = window

  const [overviewRow, popularRoadmaps, completedModules, stalledLearners] = await Promise.all([
    db.get(
      `${learnerProgressCte}
       SELECT
         (SELECT COUNT(*) FROM users WHERE role = 'user' AND is_active = 1) AS total_users,
         COUNT(DISTINCT CASE
           WHEN users.is_active = 1 AND learner_progress.last_activity_at >= ?
           THEN learner_progress.user_id
         END) AS active_users,
         COUNT(*) AS started_roadmaps,
         COALESCE(SUM(CASE
           WHEN learner_progress.total_lessons > 0
            AND learner_progress.completed_lessons_count >= learner_progress.total_lessons
           THEN 1 ELSE 0
         END), 0) AS completed_roadmaps,
         (SELECT COUNT(*) FROM user_module_evidences) AS submitted_evidences,
         COUNT(DISTINCT CASE
           WHEN users.is_active = 1
            AND learner_progress.last_activity_at <= ?
            AND (
              learner_progress.total_lessons = 0
              OR learner_progress.completed_lessons_count < learner_progress.total_lessons
            )
           THEN learner_progress.user_id
         END) AS stalled_users
       FROM learner_progress
       INNER JOIN users ON users.id = learner_progress.user_id`,
      [activeSince, pausedBefore]
    ),
    db.all(
      `${learnerProgressCte}
       SELECT
         roadmaps.id AS roadmap_id,
         roadmaps.title,
         COUNT(learner_progress.user_id) AS learners_count,
         COALESCE(SUM(CASE
           WHEN learner_progress.last_activity_at >= ? THEN 1 ELSE 0
         END), 0) AS active_learners_count,
         COALESCE(SUM(CASE
           WHEN learner_progress.total_lessons > 0
            AND learner_progress.completed_lessons_count >= learner_progress.total_lessons
           THEN 1 ELSE 0
         END), 0) AS completed_learners_count
       FROM roadmaps
       LEFT JOIN learner_progress ON learner_progress.roadmap_id = roadmaps.id
       GROUP BY roadmaps.id
       HAVING learners_count > 0
       ORDER BY learners_count DESC, active_learners_count DESC, roadmaps.title
       LIMIT 5`,
      [activeSince]
    ),
    db.all(
      `WITH module_progress AS (
         SELECT
           modules.id AS module_id,
           ulp.user_id,
           COUNT(lessons.id) AS total_lessons,
           SUM(CASE WHEN ulp.completed_at IS NOT NULL THEN 1 ELSE 0 END)
             AS completed_lessons_count
         FROM modules
         INNER JOIN lessons ON lessons.module_id = modules.id
         INNER JOIN user_lesson_progress ulp ON ulp.lesson_id = lessons.id
         INNER JOIN users AS learner_user
           ON learner_user.id = ulp.user_id
          AND learner_user.role = 'user'
         GROUP BY modules.id, ulp.user_id
       ),
       module_totals AS (
         SELECT module_id, COUNT(*) AS total_lessons
         FROM lessons
         GROUP BY module_id
       )
       SELECT
         modules.id AS module_id,
         modules.title,
         roadmaps.id AS roadmap_id,
         roadmaps.title AS roadmap_title,
         module_totals.total_lessons,
         COUNT(module_progress.user_id) AS learners_count,
         COALESCE(SUM(CASE
           WHEN module_progress.completed_lessons_count >= module_totals.total_lessons
           THEN 1 ELSE 0
         END), 0) AS completed_learners_count
       FROM modules
       INNER JOIN roadmaps ON roadmaps.id = modules.roadmap_id
       INNER JOIN module_totals ON module_totals.module_id = modules.id
       LEFT JOIN module_progress ON module_progress.module_id = modules.id
       GROUP BY modules.id
       HAVING completed_learners_count > 0
       ORDER BY completed_learners_count DESC, learners_count DESC, modules.title
       LIMIT 5`
    ),
    db.all(
      `${learnerProgressCte}
       SELECT
         users.id AS user_id,
         users.email,
         users.name,
         roadmaps.id AS roadmap_id,
         roadmaps.title AS roadmap_title,
         current_module.title AS current_module_title,
         learner_progress.completed_lessons_count,
         learner_progress.total_lessons,
         CASE
           WHEN learner_progress.total_lessons > 0
           THEN ROUND(learner_progress.completed_lessons_count * 100.0 / learner_progress.total_lessons)
           ELSE 0
         END AS progress_percentage,
         learner_progress.last_activity_at,
         CAST(julianday(?) - julianday(learner_progress.last_activity_at) AS INTEGER)
           AS inactivity_days
       FROM learner_progress
       INNER JOIN users ON users.id = learner_progress.user_id
       INNER JOIN roadmaps ON roadmaps.id = learner_progress.roadmap_id
       LEFT JOIN modules AS current_module ON current_module.id = learner_progress.current_module_id
       WHERE users.is_active = 1
         AND learner_progress.last_activity_at <= ?
         AND (
           learner_progress.total_lessons = 0
           OR learner_progress.completed_lessons_count < learner_progress.total_lessons
         )
       ORDER BY inactivity_days DESC, users.email, roadmaps.title
       LIMIT 10`,
      [generatedAt, pausedBefore]
    )
  ])

  return [overviewRow, popularRoadmaps, completedModules, stalledLearners] as const
}
