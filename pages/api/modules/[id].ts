import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/audit'
import { getUserFromRequest, requireAdmin, requireReadAccess } from '../../../lib/auth'
import { openDb } from '../../../lib/db'
import { touchRoadmapProgress } from '../../../lib/progress'
import { buildModuleQuiz, getModuleQuizSummary, toPublicModuleQuiz } from '../../../lib/quizzes'

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
  const { id } = req.query

  if (req.method === 'GET') {
    if (!(await requireReadAccess(req, res, db))) return
    const moduleRow = await db.get('SELECT * FROM modules WHERE id = ?', [id])
    if (!moduleRow) return res.status(404).json({ error: 'not found' })
    const user = await getUserFromRequest(req, db)

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
    const { title } = req.body
    const result = await db.run('UPDATE modules SET title = ? WHERE id = ?', [title, id])
    if (!result.changes) return res.status(404).json({ error: 'module not found' })
    
    const updated = await db.get('SELECT * FROM modules WHERE id = ?', [id])
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'module.update',
      entityType: 'module',
      entityId: String(id),
      details: { title }
    })
    return res.status(200).json(updated)
  }

  if (req.method === 'DELETE') {
    const admin = await requireAdmin(req, res, db)
    if (!admin) return
    const moduleRow = await db.get('SELECT title, roadmap_id FROM modules WHERE id = ?', [id])
    if (!moduleRow) return res.status(404).json({ error: 'module not found' })
    
    await db.run('DELETE FROM modules WHERE id = ?', [id])
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

  res.setHeader('Allow', 'GET, PUT, DELETE')
  res.status(405).end('Method Not Allowed')
}
