/**
 * Student self-export of quiz results (demo distribution: each learner runs an
 * isolated instance and sends this file to the mentor).
 *
 * Only the learner's own attempts, with scores. Raw answers are deliberately
 * left out: the stored blob also carries the graded feedback (correct answers).
 */
export const QUIZ_EXPORT_FORMATS = ['json', 'csv'] as const
export type QuizExportFormat = (typeof QUIZ_EXPORT_FORMATS)[number]

export type QuizAttemptExportRow = {
  attempt_id: number
  roadmap_id: number | null
  roadmap_title: string | null
  module_id: number | null
  module_title: string | null
  quiz_scope: string
  score: number
  max_score: number
  /** Rounded whole percentage; 0 when `max_score` is not positive. */
  percentage: number
  /** ISO-8601 timestamp. */
  submitted_at: string
}

export type QuizResultsExport = {
  exported_at: string
  user: { email: string; name: string | null }
  total_attempts: number
  attempts: QuizAttemptExportRow[]
}

export function quizPercentage(score: number, maxScore: number): number {
  if (!(maxScore > 0)) return 0
  return Math.round((score / maxScore) * 100)
}

export function buildQuizResultsExport(
  user: { email: string; name?: string | null },
  attempts: QuizAttemptExportRow[],
  exportedAt: Date
): QuizResultsExport {
  return {
    exported_at: exportedAt.toISOString(),
    user: { email: user.email, name: user.name || null },
    total_attempts: attempts.length,
    attempts
  }
}

const CSV_COLUMNS = [
  'user_email',
  'user_name',
  'attempt_id',
  'roadmap_id',
  'roadmap_title',
  'module_id',
  'module_title',
  'quiz_scope',
  'score',
  'max_score',
  'percentage',
  'submitted_at'
] as const

/**
 * One CSV cell. Text starting with `=`, `+`, `-`, `@` (or a tab/CR) would be
 * evaluated as a formula by spreadsheets, so it gets a leading `'`. Numbers are
 * never guarded (they cannot be negative here). Cells with `,`, `"` or line
 * breaks are quoted with doubled quotes.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** UTF-8 BOM first so Excel reads accents correctly; CRLF line endings (RFC 4180). */
export function quizResultsToCsv(data: QuizResultsExport): string {
  const lines = [CSV_COLUMNS.join(',')]
  for (const attempt of data.attempts) {
    const row: Record<(typeof CSV_COLUMNS)[number], string | number | null> = {
      user_email: data.user.email,
      user_name: data.user.name,
      attempt_id: attempt.attempt_id,
      roadmap_id: attempt.roadmap_id,
      roadmap_title: attempt.roadmap_title,
      module_id: attempt.module_id,
      module_title: attempt.module_title,
      quiz_scope: attempt.quiz_scope,
      score: attempt.score,
      max_score: attempt.max_score,
      percentage: attempt.percentage,
      submitted_at: attempt.submitted_at
    }
    lines.push(CSV_COLUMNS.map(column => csvCell(row[column])).join(','))
  }
  return `﻿${lines.join('\r\n')}\r\n`
}

export function quizResultsFilename(exportedAt: Date, format: QuizExportFormat): string {
  return `quiz-results-${exportedAt.toISOString().slice(0, 10)}.${format}`
}
