import { MODULE_LEVELS, normalizeMetadataKey } from './roadmapMetadata'

export const ROADMAP_SORT_OPTIONS = ['relevance', 'title', 'duration'] as const
export type RoadmapSort = typeof ROADMAP_SORT_OPTIONS[number]

export const ROADMAP_DURATION_FILTERS = [
  { key: 'up-to-4', label: 'Hasta 4 semanas', min: 0, max: 4 },
  { key: '5-to-12', label: '5-12 semanas', min: 5, max: 12 },
  { key: 'over-12', label: 'Más de 12 semanas', min: 13, max: Number.POSITIVE_INFINITY }
] as const

export type RoadmapDurationFilter = typeof ROADMAP_DURATION_FILTERS[number]['key']

export type RoadmapCatalogFilters = {
  categories: string[]
  topics: string[]
  levels: string[]
  durations: RoadmapDurationFilter[]
  sort: RoadmapSort
}

function queryValues(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return [...new Set(values.flatMap(item => String(item).split(','))
    .map(normalizeMetadataKey)
    .filter(value => Boolean(value) && value.length <= 64))]
    .slice(0, 20)
}

export function parseRoadmapCatalogFilters(query: Record<string, string | string[] | undefined>): RoadmapCatalogFilters {
  const durationKeys = new Set(ROADMAP_DURATION_FILTERS.map(item => item.key))
  const sortValue = Array.isArray(query.sort) ? query.sort[0] : query.sort

  return {
    categories: queryValues(query.category),
    topics: queryValues(query.topic),
    levels: queryValues(query.level).filter(value => MODULE_LEVELS.some(level => level === value)),
    durations: queryValues(query.duration)
      .filter((value): value is RoadmapDurationFilter => durationKeys.has(value as RoadmapDurationFilter)),
    sort: ROADMAP_SORT_OPTIONS.includes(sortValue as RoadmapSort) ? sortValue as RoadmapSort : 'relevance'
  }
}

export function roadmapDurationMatches(
  minWeeks: unknown,
  maxWeeks: unknown,
  selected: RoadmapDurationFilter[]
) {
  if (!selected.length) return true
  const min = Number(minWeeks)
  const max = Number(maxWeeks)
  if (!Number.isFinite(min) || !Number.isFinite(max)) return false

  return ROADMAP_DURATION_FILTERS.some(range => (
    selected.includes(range.key) && min <= range.max && max >= range.min
  ))
}
