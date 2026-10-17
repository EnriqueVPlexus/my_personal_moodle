import type { ModuleRecord, ModuleWithQuizBank } from './types'

/**
 * Columns of a module that may reach an API response. `quiz_bank` is
 * deliberately absent: it holds the correct answers of the quiz, so only the
 * quiz grading code reads it (through `findQuizSourceById`).
 */
export const PUBLIC_MODULE_COLUMNS = [
  'id',
  'roadmap_id',
  'position',
  'title',
  'duration',
  'duration_weeks_min',
  'duration_weeks_max',
  'level',
  'objective',
  'contents',
  'importance',
  'official_resources',
  'support_videos',
  'practical_activity',
  'deliverable_evidence',
  'evaluation',
  'quiz_pass_percentage',
  'quiz_max_attempts',
  'quiz_cooldown_minutes'
] as const satisfies ReadonlyArray<keyof ModuleRecord>

/** SQL column list for the public projection, optionally qualified with a table alias. */
export function publicModuleColumnsSql(table?: string): string {
  const prefix = table ? `${table}.` : ''
  return PUBLIC_MODULE_COLUMNS.map(column => `${prefix}${column}`).join(', ')
}

/**
 * Drops the quiz answers from a module row. Use it whenever a row that may
 * carry `quiz_bank` is about to be spread into a response.
 */
export function toPublicModule<T extends Partial<ModuleWithQuizBank>>(row: T): Omit<T, 'quiz_bank'> {
  const { quiz_bank: _quizBank, ...publicModule } = row
  return publicModule
}
