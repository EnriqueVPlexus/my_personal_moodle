export const DEFAULT_ROADMAP_VERSION = 'v1.0.0'

/** The one definition of a valid roadmap version (`v1.0.0`). */
export const ROADMAP_VERSION_PATTERN = /^v\d+\.\d+\.\d+$/

export function normalizeRoadmapVersion(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return DEFAULT_ROADMAP_VERSION
  if (typeof value !== 'string' || !ROADMAP_VERSION_PATTERN.test(value.trim())) return null
  return value.trim()
}

export function normalizePublishedAt(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return new Date().toISOString()
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null
  return new Date(value).toISOString()
}
