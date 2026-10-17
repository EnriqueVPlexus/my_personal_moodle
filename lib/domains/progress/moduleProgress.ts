export type ModuleProgress = {
  total_lessons: number
  completed_lessons_count: number
  progress_percentage: number
  status: 'completed' | 'in_progress' | 'not_started'
  next_lesson_id: number | null
  next_lesson_title: string | null
  time_spent_seconds: number
}

type ModuleLessonRow = {
  id?: number
  title?: string
  completed?: unknown
  progress_time_spent_seconds?: unknown
}

/**
 * Derives the learner's progress for one module from its lessons joined with
 * their own progress rows. `opened` marks that the learner has visited the
 * module, which is enough to count as in progress.
 */
export function buildModuleProgress(lessons: ModuleLessonRow[], opened: boolean): ModuleProgress {
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
