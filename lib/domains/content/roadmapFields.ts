import { z } from 'zod'
import { ROADMAP_VERSION_PATTERN, normalizePublishedAt, normalizeRoadmapVersion } from './version'

/**
 * Zod primitives for the roadmap `version` and `published_at` fields, built on
 * the same normalizers the roadmap body schemas and the seed use
 * (`normalizeRoadmapVersion`, `normalizePublishedAt`), so the format rules live
 * in one place (`./version`). The caller supplies the Spanish message.
 *
 * Both accept a string, `null` or an omitted key; blank input becomes the
 * default (`v1.0.0`, now) exactly as the normalizers do.
 */

export function roadmapVersionField(message: string) {
  return z
    .string({ error: message })
    .refine(value => normalizeRoadmapVersion(value) !== null, message)
    .nullish()
    .transform(value => normalizeRoadmapVersion(value) as string)
    .meta({ pattern: ROADMAP_VERSION_PATTERN.source })
}

export function publishedAtField(message: string) {
  return z
    .string({ error: message })
    .refine(value => normalizePublishedAt(value) !== null, message)
    .nullish()
    .transform(value => normalizePublishedAt(value) as string)
    .meta({ format: 'date-time' })
}
