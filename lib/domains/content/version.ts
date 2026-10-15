export const DEFAULT_ROADMAP_VERSION = 'v1.0.0'

export function normalizeRoadmapVersion(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return DEFAULT_ROADMAP_VERSION
  if (typeof value !== 'string' || !/^v\d+\.\d+\.\d+$/.test(value.trim())) return null
  return value.trim()
}

export function normalizePublishedAt(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return new Date().toISOString()
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null
  return new Date(value).toISOString()
}
