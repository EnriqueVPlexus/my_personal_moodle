import { z } from 'zod'
import { normalizeTopics } from '../domains/content/metadata'
import { normalizePublishedAt, normalizeRoadmapVersion } from '../domains/content/version'
import { resolveCreateDurationWeeks, resolveUpdateDurationWeeks, weeksField } from './duration'
import { bodyObject, optionalText, positiveInt, queryObject, text } from './primitives'

export const MAX_ROADMAP_TOPICS = 20
const MAX_RAW_TOPICS = 100
const TOO_MANY_TOPICS = `Un roadmap puede tener como máximo ${MAX_ROADMAP_TOPICS} temas.`

export const roadmapIdQuerySchema = queryObject({ id: positiveInt('id') })

// Topics arrive as an array or a comma separated string; normalizeTopics owns the cleanup.
const topicsField = z
  .union(
    [
      z.array(z.union([z.string(), z.number()])).max(MAX_RAW_TOPICS, TOO_MANY_TOPICS),
      z.string().max(2000),
      z.null()
    ],
    { error: 'El campo «temas» debe ser una lista de textos.' }
  )
  .transform(value => normalizeTopics(value))
  .pipe(
    z
      .array(z.string().max(100, 'Cada tema no puede superar 100 caracteres.'))
      .max(MAX_ROADMAP_TOPICS, TOO_MANY_TOPICS)
  )
  .optional()

const roadmapShape = {
  title: text('título', 200),
  description: optionalText('descripción', 5000),
  duration: optionalText('duración', 100),
  category: optionalText('categoría', 100),
  topics: topicsField,
  duration_weeks_min: weeksField,
  duration_weeks_max: weeksField,
  version: z.unknown().optional(),
  published_at: z.unknown().optional()
}

const INVALID_VERSION = 'La versión del roadmap no es válida (formato v1.0.0).'
const INVALID_PUBLISHED_AT = 'La fecha de publicación no es válida.'

// On create an omitted version/date falls back to the defaults (normalizers return them).
export const createRoadmapBodySchema = bodyObject(roadmapShape).transform((data, ctx) => {
  const durationWeeks = resolveCreateDurationWeeks(data, ctx)
  const version = normalizeRoadmapVersion(data.version)
  const publishedAt = normalizePublishedAt(data.published_at)
  if (!version) ctx.issues.push({ code: 'custom', message: INVALID_VERSION, input: data.version, path: ['version'] })
  if (!publishedAt) ctx.issues.push({ code: 'custom', message: INVALID_PUBLISHED_AT, input: data.published_at, path: ['published_at'] })
  if (!version || !publishedAt || ctx.issues.length > 0) return z.NEVER

  return {
    title: data.title,
    description: data.description,
    duration: data.duration,
    category: data.category,
    topics: data.topics,
    durationWeeks,
    version,
    publishedAt
  }
})

// On update, omitted fields stay `undefined` so the stored value is left untouched.
export const updateRoadmapBodySchema = bodyObject(roadmapShape).transform((data, ctx) => {
  const durationWeeks = resolveUpdateDurationWeeks(data, ctx)
  const version = data.version !== undefined ? normalizeRoadmapVersion(data.version) : undefined
  const publishedAt = data.published_at !== undefined ? normalizePublishedAt(data.published_at) : undefined
  if (version === null) ctx.issues.push({ code: 'custom', message: INVALID_VERSION, input: data.version, path: ['version'] })
  if (publishedAt === null) ctx.issues.push({ code: 'custom', message: INVALID_PUBLISHED_AT, input: data.published_at, path: ['published_at'] })
  if (version === null || publishedAt === null || ctx.issues.length > 0) return z.NEVER

  return {
    title: data.title,
    description: data.description,
    duration: data.duration,
    category: data.category,
    topics: data.topics,
    durationWeeks,
    version,
    publishedAt
  }
})

export type CreateRoadmapBody = z.infer<typeof createRoadmapBodySchema>
export type UpdateRoadmapBody = z.infer<typeof updateRoadmapBodySchema>
