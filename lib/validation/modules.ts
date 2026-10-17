import { z } from 'zod'
import { normalizeModuleLevel } from '../roadmapMetadata'
import { resolveCreateDurationWeeks, resolveUpdateDurationWeeks, weeksField } from './duration'
import { bodyObject, optionalPositiveInt, optionalText, positiveInt, queryObject, text } from './primitives'

export const moduleIdQuerySchema = queryObject({ id: positiveInt('id') })
export const moduleListQuerySchema = queryObject({ // An empty `?roadmap_id=` has always meant "no filter".
  roadmap_id: z.preprocess(value => (value === '' ? undefined : value), optionalPositiveInt('roadmap_id'))
})

const moduleShape = {
  title: text('título', 200),
  level: z.union([z.string(), z.null()], { error: 'El campo «nivel» debe ser un texto.' }).optional(),
  duration: optionalText('duración', 100),
  duration_weeks_min: weeksField,
  duration_weeks_max: weeksField
}

// `level: undefined` means "not sent"; `null` means "sent but empty".
function resolveLevel(level: string | null | undefined, ctx: z.core.$RefinementCtx<unknown>) {
  const normalized = level === undefined ? undefined : normalizeModuleLevel(level)
  if (level && !normalized) {
    ctx.issues.push({ code: 'custom', message: 'El nivel del módulo no es válido.', input: level, path: ['level'] })
  }
  return normalized
}

export const createModuleBodySchema = bodyObject({
  ...moduleShape,
  roadmap_id: positiveInt('roadmap_id')
}).transform((data, ctx) => {
  const level = resolveLevel(data.level, ctx)
  const durationWeeks = resolveCreateDurationWeeks(data, ctx)
  if (ctx.issues.length > 0) return z.NEVER
  return {
    title: data.title,
    roadmap_id: data.roadmap_id,
    level: level ?? null,
    duration: data.duration,
    durationWeeks
  }
})

export const updateModuleBodySchema = bodyObject(moduleShape).transform((data, ctx) => {
  const level = resolveLevel(data.level, ctx)
  const durationWeeks = resolveUpdateDurationWeeks(data, ctx)
  if (ctx.issues.length > 0) return z.NEVER
  return {
    title: data.title,
    level,
    duration: data.duration,
    durationWeeks
  }
})

export type CreateModuleBody = z.infer<typeof createModuleBodySchema>
export type UpdateModuleBody = z.infer<typeof updateModuleBodySchema>
