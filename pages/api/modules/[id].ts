import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { getRoadmapReadScope, requireAdmin, scopeAllowsRoadmap } from '../../../lib/auth'
import { openDb } from '../../../lib/persistence'
import { deleteModule, findModuleById, updateModuleCore } from '../../../lib/moduleRepository'
import { touchRoadmapProgress } from '../../../lib/progressRepository'
import { getModuleQuizSummary } from '../../../lib/quizRepository'
import { buildModuleQuiz, toPublicModuleQuiz } from '../../../lib/quizzes'
import { parseOrRespond } from '../../../lib/validation/http'
import { moduleIdQuerySchema, updateModuleBodySchema } from '../../../lib/validation/modules'

function buildModuleProgress(lessons: any[], opened: boolean) {
  const totalLessons = lessons.length
  const completedLessonsCount = lessons.filter(lesson => Number(lesson.completed) === 1).length
  const progressPercentage = totalLessons > 0
    ? Math.min(100, Math.round((completedLessonsCount / totalLessons) * 100))
    : 0
  const nextLesson = lessons.find(lesson => Number(lesson.completed) !== 1)
  const timeSpentSeconds = lessons.reduce((sum, lesson) => (
    sum + Number(lesson.progress_time_spent_seconds || 0)
  ), 0)
  const status = totalLessons > 0 && completedLessonsCount >= totalLessons
    ? 'completed'
    : completedLessonsCount > 0 || opened
      ? 'in_progress'
      : 'not_started'

  return {
    total_lessons: totalLessons,
    completed_lessons_count: completedLessonsCount,
    progress_percentage: progressPercentage,
    status,
    next_lesson_id: nextLesson?.id ?? null,
    next_lesson_title: nextLesson?.title ?? null,
    time_spent_seconds: timeSpentSeconds
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'GET, PUT, DELETE')
    return res.status(405).end('Method Not Allowed')
  }

  const params = parseOrRespond(moduleIdQuerySchema, req.query, res)
  if (!params) return
  const { id } = params

  if (req.method === 'GET') {
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return
    const moduleRow = await findModuleById(db, id)
    if (!moduleRow) return res.status(404).json({ error: 'No encontrado.' })
    if (!scopeAllowsRoadmap(scope, moduleRow.roadmap_id)) return res.status(404).json({ error: 'No encontrado.' })
    const user = scope.user

    if (user) {
      await touchRoadmapProgress(db, {
        userId: user.id,
        roadmapId: moduleRow.roadmap_id,
        moduleId: moduleRow.id
      })
    }

    const lessons = user
      ? await db.all(
        `SELECT lessons.*,
                CASE WHEN user_lesson_progress.completed_at IS NOT NULL THEN 1 ELSE 0 END AS completed,
                user_lesson_progress.started_at AS progress_started_at,
                user_lesson_progress.last_activity_at AS progress_last_activity_at,
                user_lesson_progress.completed_at AS progress_completed_at,
                COALESCE(user_lesson_progress.time_spent_seconds, 0) AS progress_time_spent_seconds
         FROM lessons
         LEFT JOIN user_lesson_progress
           ON user_lesson_progress.lesson_id = lessons.id
          AND user_lesson_progress.user_id = ?
         WHERE lessons.module_id = ?
         ORDER BY lessons.id`,
        [user.id, id]
      )
      : await db.all('SELECT * FROM lessons WHERE module_id = ? ORDER BY id', [id])
    const quiz = buildModuleQuiz(moduleRow)
    const quizSummary = user ? await getModuleQuizSummary(db, user.id, moduleRow.id) : null

    return res.status(200).json({
      ...moduleRow,
      lessons,
      progress: user ? buildModuleProgress(lessons, true) : null,
      quiz: toPublicModuleQuiz(quiz),
      quiz_summary: quizSummary
    })
  }

  if (req.method === 'PUT') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const body = parseOrRespond(updateModuleBodySchema, req.body, res)
    if (!body) return
    const { title, level, duration, durationWeeks } = body
    const changes = await updateModuleCore(db, id, {
      title,
      ...(level !== undefined ? { level } : {}),
      ...(duration !== undefined ? { duration: duration || null } : {}),
      ...(durationWeeks ? { durationWeeks: { min: durationWeeks.min, max: durationWeeks.max } } : {})
    })
    if (!changes) return res.status(404).json({ error: 'Módulo no encontrado.' })

    const updated = await findModuleById(db, id)
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'module.update',
      entityType: 'module',
      entityId: String(id),
      details: { title, level: level ?? null }
    })
    return res.status(200).json(updated)
  }

  if (req.method === 'DELETE') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const moduleRow = await findModuleById(db, id)
    if (!moduleRow) return res.status(404).json({ error: 'Módulo no encontrado.' })

    await deleteModule(db, id)
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'module.delete',
      entityType: 'module',
      entityId: String(id),
      details: { title: moduleRow?.title || null, roadmap_id: moduleRow?.roadmap_id || null }
    })
    return res.status(204).end()
  }
}
