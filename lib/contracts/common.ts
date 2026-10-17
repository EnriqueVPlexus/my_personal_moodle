import { z } from 'zod'

/**
 * Building blocks shared by every contract: the error bodies the API writes
 * today and small helpers to describe fields. They document the wire format,
 * they do not change it.
 */

/** Dates travel as text: ISO 8601 from the services, or the database's own text on SQLite. */
export const timestampSchema = z.string().meta({
  description: 'Fecha y hora como texto (normalmente ISO 8601; en SQLite puede ser `YYYY-MM-DD HH:MM:SS`).'
})

export const positiveIdSchema = z.number().int().min(1)

// --- Errors ----------------------------------------------------------------

export const validationIssueSchema = z.object({
  path: z.string().meta({ description: 'Ruta del campo, p. ej. `modules[0].title`. Vacía si el error es del cuerpo completo.' }),
  message: z.string()
})

/**
 * Shared error contract. `issues` only appears on validation errors (400) and
 * on the roadmap import report, with at most 20 entries on generic validation.
 */
export const errorBodySchema = z.object({
  error: z.string().meta({ description: 'Mensaje legible para mostrar al usuario.' }),
  issues: z.array(validationIssueSchema).optional()
})

/** 409 from `POST /api/roadmaps/import`: the extra `code` tells which conflict happened. */
export const importConflictBodySchema = z.object({
  error: z.string(),
  code: z.enum(['already_exists', 'not_found'])
})

/** Quiz attempt eligibility, also embedded in the 429 body of `POST /api/quizzes/modules/{id}`. */
export const attemptEligibilitySchema = z.object({
  allowed: z.boolean(),
  remaining_attempts: z.number().nullable().optional(),
  cooldown_ends_at: z.string().nullable().optional(),
  pass_percentage: z.number()
})

export const quizNotEligibleBodySchema = z.object({
  error: z.string(),
  eligibility: attemptEligibilitySchema
})

/** Plain text body of every 405 (`Allow` header lists the supported methods). */
export const methodNotAllowedBodySchema = z.literal('Method Not Allowed')

export type ErrorBody = z.infer<typeof errorBodySchema>
export type ValidationIssue = z.infer<typeof validationIssueSchema>
export type ImportConflictBody = z.infer<typeof importConflictBodySchema>
export type QuizNotEligibleBody = z.infer<typeof quizNotEligibleBodySchema>
export type AttemptEligibility = z.infer<typeof attemptEligibilitySchema>

// --- Helpers ---------------------------------------------------------------

/**
 * A `COUNT(...)` aggregate. Repositories normalize it to a JSON number on
 * both databases (the `pg` driver returns `bigint` as text; see
 * lib/persistence/normalize.ts), so clients never receive numeric text.
 */
export const countSchema = z.number().int().min(0).meta({
  description: 'Contador: siempre un entero (número JSON) con SQLite y con PostgreSQL.'
})
