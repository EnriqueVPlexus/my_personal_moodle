type DbHandle = {
  get: (sql: string, params?: any[]) => Promise<any>
  run: (sql: string, params?: any[]) => Promise<any>
  all: (sql: string, params?: any[]) => Promise<any[]>
}

type RoadmapProgressTouch = {
  userId: number
  roadmapId: number
  moduleId?: number | null
  lessonId?: number | null
  completedLessonsCount?: number
  timeSpentSeconds?: number
  completedAt?: string | null
}

type LessonProgressUpdate = {
  userId: number
  lessonId: number
  completed: boolean
  timeSpentSeconds?: number
}

type LessonContext = {
  lessonId: number
  moduleId: number
  roadmapId: number
  title: string
}

export type UserRoadmapProgressSummary = {
  roadmap_id: number
  title: string
  description?: string | null
  duration?: string | null
  started_at?: string | null
  last_activity_at: string
  completed_at?: string | null
  completed_lessons_count: number
  total_lessons: number
  total_modules: number
  time_spent_seconds: number
  current_module_id?: number | null
  current_module_title?: string | null
  current_lesson_id?: number | null
  current_lesson_title?: string | null
  progress_percentage: number
  status: 'started' | 'in_progress' | 'completed'
  next_href: string
  next_step_label: string
}

function nowIso() {
  return new Date().toISOString()
}

function clampTimeSpent(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value || 0)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.round(numeric)
}

async function getRoadmapProgressSnapshot(db: DbHandle, userId: number, roadmapId: number) {
  const totals = await db.get(
    `SELECT
        COALESCE(SUM(user_lesson_progress.time_spent_seconds), 0) AS time_spent_seconds,
        COALESCE(SUM(CASE WHEN user_lesson_progress.completed_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS completed_lessons_count
     FROM user_lesson_progress
     INNER JOIN lessons ON lessons.id = user_lesson_progress.lesson_id
     INNER JOIN modules ON modules.id = lessons.module_id
     WHERE user_lesson_progress.user_id = ?
       AND modules.roadmap_id = ?`,
    [userId, roadmapId]
  )

  const lessonCount = await db.get(
    `SELECT COUNT(*) AS count
     FROM lessons
     INNER JOIN modules ON modules.id = lessons.module_id
     WHERE modules.roadmap_id = ?`,
    [roadmapId]
  )

  const completedLessonsCount = Number(totals?.completed_lessons_count || 0)
  const totalLessons = Number(lessonCount?.count || 0)

  return {
    completedLessonsCount,
    timeSpentSeconds: Number(totals?.time_spent_seconds || 0),
    completedAt: totalLessons > 0 && completedLessonsCount >= totalLessons ? nowIso() : null
  }
}

export async function touchRoadmapProgress(db: DbHandle, options: RoadmapProgressTouch) {
  const now = nowIso()
  const existing = await db.get(
    'SELECT * FROM user_roadmap_progress WHERE user_id = ? AND roadmap_id = ?',
    [options.userId, options.roadmapId]
  )

  const currentModuleId = options.moduleId === undefined ? existing?.current_module_id ?? null : options.moduleId
  const currentLessonId = options.lessonId === undefined ? existing?.current_lesson_id ?? null : options.lessonId
  const completedLessonsCount = options.completedLessonsCount ?? existing?.completed_lessons_count ?? 0
  const timeSpentSeconds = options.timeSpentSeconds ?? existing?.time_spent_seconds ?? 0
  const completedAt = options.completedAt === undefined ? existing?.completed_at ?? null : options.completedAt

  if (existing) {
    await db.run(
      `UPDATE user_roadmap_progress
       SET current_module_id = ?, current_lesson_id = ?, started_at = COALESCE(started_at, ?),
           last_activity_at = ?, completed_at = ?, completed_lessons_count = ?,
           time_spent_seconds = ?, updated_at = ?
       WHERE user_id = ? AND roadmap_id = ?`,
      [
        currentModuleId,
        currentLessonId,
        now,
        now,
        completedAt,
        completedLessonsCount,
        timeSpentSeconds,
        now,
        options.userId,
        options.roadmapId
      ]
    )
  } else {
    await db.run(
      `INSERT INTO user_roadmap_progress (
        user_id, roadmap_id, current_module_id, current_lesson_id, started_at,
        last_activity_at, completed_at, completed_lessons_count, time_spent_seconds,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  }
}

async function getLessonContext(db: DbHandle, lessonId: number): Promise<LessonContext | null> {
  const row = await db.get(
    `SELECT lessons.id AS lesson_id, lessons.title, lessons.module_id, modules.roadmap_id
     FROM lessons
     INNER JOIN modules ON modules.id = lessons.module_id
     WHERE lessons.id = ?`,
    [lessonId]
  )

  if (!row) return null

  return {
    lessonId: row.lesson_id,
    title: row.title,
    moduleId: row.module_id,
    roadmapId: row.roadmap_id
  }
}

export async function setLessonProgress(db: DbHandle, options: LessonProgressUpdate) {
  const lesson = await getLessonContext(db, options.lessonId)
  if (!lesson) return null

  const now = nowIso()
  const existing = await db.get(
    'SELECT * FROM user_lesson_progress WHERE user_id = ? AND lesson_id = ?',
    [options.userId, options.lessonId]
  )
  const additionalTimeSpent = clampTimeSpent(options.timeSpentSeconds)
  const totalTimeSpent = Number(existing?.time_spent_seconds || 0) + additionalTimeSpent
  const startedAt = existing?.started_at || now
  const completedAt = options.completed ? now : null

  if (existing) {
    await db.run(
      `UPDATE user_lesson_progress
       SET started_at = ?, last_activity_at = ?, completed_at = ?,
           time_spent_seconds = ?, updated_at = ?
       WHERE user_id = ? AND lesson_id = ?`,
      [
        startedAt,
        now,
        completedAt,
        totalTimeSpent,
        now,
        options.userId,
        options.lessonId
      ]
    )
  } else {
    await db.run(
      `INSERT INTO user_lesson_progress (
        user_id, lesson_id, started_at, last_activity_at, completed_at,
        time_spent_seconds, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        options.userId,
        options.lessonId,
        startedAt,
        now,
        completedAt,
        totalTimeSpent,
        now,
        now
      ]
    )
  }

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

export async function listUserRoadmapProgress(db: DbHandle, userId: number): Promise<UserRoadmapProgressSummary[]> {
  const rows = await db.all(
    `SELECT
        user_roadmap_progress.roadmap_id,
        roadmaps.title,
        roadmaps.description,
        roadmaps.duration,
        user_roadmap_progress.started_at,
        user_roadmap_progress.last_activity_at,
        user_roadmap_progress.completed_at,
        user_roadmap_progress.completed_lessons_count,
        user_roadmap_progress.time_spent_seconds,
        user_roadmap_progress.current_module_id,
        current_module.title AS current_module_title,
        user_roadmap_progress.current_lesson_id,
        current_lesson.title AS current_lesson_title,
        COUNT(DISTINCT modules.id) AS total_modules,
        COUNT(lessons.id) AS total_lessons
     FROM user_roadmap_progress
     INNER JOIN roadmaps ON roadmaps.id = user_roadmap_progress.roadmap_id
     LEFT JOIN modules ON modules.roadmap_id = roadmaps.id
     LEFT JOIN lessons ON lessons.module_id = modules.id
     LEFT JOIN modules AS current_module ON current_module.id = user_roadmap_progress.current_module_id
     LEFT JOIN lessons AS current_lesson ON current_lesson.id = user_roadmap_progress.current_lesson_id
     WHERE user_roadmap_progress.user_id = ?
     GROUP BY
       user_roadmap_progress.id,
       roadmaps.title,
       roadmaps.description,
       roadmaps.duration,
       current_module.title,
       current_lesson.title
     ORDER BY datetime(user_roadmap_progress.last_activity_at) DESC, user_roadmap_progress.id DESC`,
    [userId]
  )

  return rows.map((row: any) => {
    const totalLessons = Number(row.total_lessons || 0)
    const completedLessonsCount = Number(row.completed_lessons_count || 0)
    const progressPercentage = totalLessons > 0
      ? Math.min(100, Math.round((completedLessonsCount / totalLessons) * 100))
      : 0
    const status = row.completed_at
      ? 'completed'
      : completedLessonsCount > 0 || row.current_module_id
        ? 'in_progress'
        : 'started'
    const nextHref = row.current_module_id ? `/modules/${row.current_module_id}` : `/roadmaps/${row.roadmap_id}`
    const nextStepLabel = row.completed_at
      ? 'Volver al roadmap'
      : row.current_lesson_title
        ? `Continuar con ${row.current_lesson_title}`
        : row.current_module_title
          ? `Continuar con ${row.current_module_title}`
          : 'Retomar roadmap'

    return {
      roadmap_id: row.roadmap_id,
      title: row.title,
      description: row.description,
      duration: row.duration,
      started_at: row.started_at,
      last_activity_at: row.last_activity_at,
      completed_at: row.completed_at,
      completed_lessons_count: completedLessonsCount,
      total_lessons: totalLessons,
      total_modules: Number(row.total_modules || 0),
      time_spent_seconds: Number(row.time_spent_seconds || 0),
      current_module_id: row.current_module_id,
      current_module_title: row.current_module_title,
      current_lesson_id: row.current_lesson_id,
      current_lesson_title: row.current_lesson_title,
      progress_percentage: progressPercentage,
      status,
      next_href: nextHref,
      next_step_label: nextStepLabel
    } as UserRoadmapProgressSummary
  })
}
