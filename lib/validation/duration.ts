import { z } from 'zod'
import { normalizeDurationRange, parseDurationWeeks } from '../roadmapMetadata'
import type { DurationRange } from '../roadmapMetadata'

type DurationInput = {
  duration?: unknown
  duration_weeks_min?: unknown
  duration_weeks_max?: unknown
}

/** Raw week bounds as sent by forms: number, numeric string, empty string or null. */
export const weeksField = z
  .union([z.number(), z.string().max(20), z.null()], {
    error: 'Las semanas de duración deben ser un número.'
  })
  .optional()

type RefinementCtx = z.core.$RefinementCtx<unknown>

/**
 * Resolves the duration range with the same rules the handlers used before:
 * explicit week bounds win, otherwise the free-text duration is parsed.
 * Invalid bounds push an issue; callers must check `ctx.issues` before using the result.
 */
export function resolveCreateDurationWeeks(data: DurationInput, ctx: RefinementCtx): DurationRange {
  const hasRange = data.duration_weeks_min !== undefined || data.duration_weeks_max !== undefined
  const range = hasRange
    ? normalizeDurationRange(data.duration_weeks_min, data.duration_weeks_max)
    : parseDurationWeeks(data.duration)
  return range ?? invalidRange(data, ctx)
}

/** On update, `undefined` means "leave the stored duration untouched". */
export function resolveUpdateDurationWeeks(data: DurationInput, ctx: RefinementCtx): DurationRange | undefined {
  const hasRange = 'duration_weeks_min' in data || 'duration_weeks_max' in data
  if (hasRange) {
    return normalizeDurationRange(data.duration_weeks_min, data.duration_weeks_max) ?? invalidRange(data, ctx)
  }
  return data.duration !== undefined ? parseDurationWeeks(data.duration) : undefined
}

function invalidRange(data: DurationInput, ctx: RefinementCtx): DurationRange {
  ctx.issues.push({
    code: 'custom',
    message: 'El rango de duración en semanas no es válido.',
    input: data,
    path: ['duration_weeks_min']
  })
  return { min: null, max: null }
}
