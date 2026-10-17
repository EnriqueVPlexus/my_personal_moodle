import { MAX_LESSON_TIME_INCREMENT_SECONDS, ROADMAP_PAUSED_AFTER_DAYS } from './constants'
import type { RoadmapProgressStatus } from './types'

/** Pure progress rules shared by the progress repository and service. */

export function progressPercentage(completed: number, total: number) {
  return total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
}

export function percentageValue(value: unknown) {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.round(numeric) : null
}

export function isPaused(lastActivityAt: unknown) {
  if (!lastActivityAt) return false
  const lastActivity = new Date(String(lastActivityAt)).getTime()
  if (!Number.isFinite(lastActivity)) return false

  const elapsedMs = Date.now() - lastActivity
  const pausedAfterMs = ROADMAP_PAUSED_AFTER_DAYS * 24 * 60 * 60 * 1000
  return elapsedMs >= pausedAfterMs
}

export function resolveRoadmapStatus(options: {
  completedAt?: string | null
  completedLessonsCount: number
  totalLessons: number
  currentModuleId?: number | null
  lastActivityAt?: string | null
}): RoadmapProgressStatus {
  if (options.totalLessons > 0 && options.completedLessonsCount >= options.totalLessons) {
    return 'completed'
  }

  const hasMeaningfulProgress = options.completedLessonsCount > 0 || Boolean(options.currentModuleId)
  if (hasMeaningfulProgress && isPaused(options.lastActivityAt)) return 'paused'
  if (hasMeaningfulProgress) return 'in_progress'
  return 'started'
}

export function clampTimeSpent(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value || 0)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.min(MAX_LESSON_TIME_INCREMENT_SECONDS, Math.round(numeric))
}
