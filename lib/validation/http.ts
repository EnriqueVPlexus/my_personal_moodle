import type { NextApiResponse } from 'next'
import { z } from 'zod'

// Safety net: any issue without a custom message falls back to Spanish text.
z.config(z.locales.es())

export type ValidationIssue = { path: string; message: string }
export type ValidationErrorBody = { error: string; issues?: ValidationIssue[] }

export const VALIDATION_FALLBACK_MESSAGE = 'Datos de entrada no válidos.'
export const MAX_REPORTED_ISSUES = 20

/** Formats a Zod path as `modules[0].title` (same style as the roadmap import issues). */
export function formatIssuePath(path: ReadonlyArray<PropertyKey>): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') return `${acc}[${segment}]`
    const key = String(segment)
    return acc ? `${acc}.${key}` : key
  }, '')
}

export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.slice(0, MAX_REPORTED_ISSUES).map(issue => ({
    path: formatIssuePath(issue.path),
    message: issue.message
  }))
}

/**
 * Sends a 400 with the shared contract `{ error, issues }`.
 * `error` defaults to the first issue message so UIs that only show `data.error` stay actionable.
 */
export function sendValidationIssues(
  res: NextApiResponse,
  issues: ValidationIssue[],
  summary?: string
) {
  const body: ValidationErrorBody = {
    error: summary || issues[0]?.message || VALIDATION_FALLBACK_MESSAGE,
    ...(issues.length > 0 ? { issues } : {})
  }
  return res.status(400).json(body)
}

export function sendValidationError(res: NextApiResponse, error: z.ZodError) {
  return sendValidationIssues(res, toValidationIssues(error))
}

/**
 * Parses `input` with `schema`. Returns the typed value, or responds with a 400
 * (contract above) and returns `null` so the handler can `return` immediately.
 */
export function parseOrRespond<S extends z.ZodType>(
  schema: S,
  input: unknown,
  res: NextApiResponse
): z.output<S> | null {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  sendValidationError(res, result.error)
  return null
}
