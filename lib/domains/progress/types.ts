export type RoadmapProgressTouch = {
  userId: number
  roadmapId: number
  moduleId?: number | null
  lessonId?: number | null
  completedLessonsCount?: number
  timeSpentSeconds?: number
  completedAt?: string | null
}

export type LessonProgressUpdate = {
  userId: number
  lessonId: number
  completed: boolean
  timeSpentSeconds?: number
}

export type RoadmapProgressStatus = 'started' | 'in_progress' | 'paused' | 'completed'

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
  status: RoadmapProgressStatus
  next_href: string
  next_step_label: string
  quiz_attempts_count: number
  average_quiz_percentage?: number | null
  best_quiz_percentage?: number | null
  last_quiz_percentage?: number | null
}

export type ModuleProgressStatus = 'not_started' | 'in_progress' | 'completed'

export type RoadmapModuleProgressSummary = {
  module_id: number
  title: string
  position?: number | null
  total_lessons: number
  completed_lessons_count: number
  progress_percentage: number
  status: ModuleProgressStatus
  last_activity_at?: string | null
  next_lesson_id?: number | null
  next_lesson_title?: string | null
}

export type RoadmapDetailProgress = {
  roadmap_id: number
  started_at?: string | null
  last_activity_at?: string | null
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
  status: RoadmapProgressStatus
  next_href: string
  next_step_label: string
  modules: RoadmapModuleProgressSummary[]
}
