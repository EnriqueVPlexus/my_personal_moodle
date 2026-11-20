import {
  ROADMAP_DURATION_FILTERS,
  ROADMAP_PROGRESS_STATUS_FILTERS,
  RoadmapCatalogFilters,
  roadmapDurationMatches
} from './filters'
import { MODULE_LEVELS } from './metadata'

export type CatalogFilterFamily = 'categories' | 'topics' | 'levels' | 'durations' | 'progressStatuses'

export const MAX_ROADMAP_SEARCH_QUERY_LENGTH = 100

export type RoadmapSearchQuery = {
  query: string
  normalizedQuery: string
  terms: string[]
  tooLong: boolean
}

export type RoadmapSearchRow = {
  id: number
  title: string
  description?: string | null
  objectives?: string | null
  methodology?: string | null
  module_search_text?: string | null
  category_key?: string | null
  category_label?: string | null
  topics_metadata?: string | null
  module_levels?: string | null
  duration_weeks_min?: number | null
  duration_weeks_max?: number | null
  [key: string]: unknown
}

export function normalizeSearchText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseRoadmapSearchQuery(value: string | string[] | undefined): RoadmapSearchQuery {
  const rawValue = Array.isArray(value) ? value[0] : value
  const query = String(rawValue ?? '').replace(/\s+/g, ' ').trim()
  const normalizedQuery = normalizeSearchText(query)

  return {
    query,
    normalizedQuery,
    terms: normalizedQuery ? normalizedQuery.split(' ') : [],
    tooLong: query.length > MAX_ROADMAP_SEARCH_QUERY_LENGTH
  }
}

function searchableFields(row: RoadmapSearchRow) {
  return {
    title: normalizeSearchText(row.title),
    description: normalizeSearchText(row.description),
    roadmapContent: normalizeSearchText(`${row.objectives ?? ''} ${row.methodology ?? ''}`),
    moduleContent: normalizeSearchText(row.module_search_text)
  }
}

function searchScore(row: RoadmapSearchRow, search: RoadmapSearchQuery) {
  if (!search.normalizedQuery) return 0

  const fields = searchableFields(row)
  const combined = Object.values(fields).join(' ')
  if (!search.terms.every(term => combined.includes(term))) return null

  let score = 0
  if (fields.title === search.normalizedQuery) score += 1000
  else if (fields.title.startsWith(search.normalizedQuery)) score += 800
  else if (fields.title.includes(search.normalizedQuery)) score += 700

  if (fields.description.includes(search.normalizedQuery)) score += 500
  if (fields.roadmapContent.includes(search.normalizedQuery)) score += 400
  if (fields.moduleContent.includes(search.normalizedQuery)) score += 300

  search.terms.forEach(term => {
    if (fields.title.includes(term)) score += 80
    if (fields.description.includes(term)) score += 40
    if (fields.roadmapContent.includes(term)) score += 30
    if (fields.moduleContent.includes(term)) score += 20
  })

  return score
}

function toPublicRoadmap(row: RoadmapSearchRow) {
  const roadmap: Record<string, unknown> = {
    ...row,
    category: row.category_key && row.category_label
      ? { key: row.category_key, label: row.category_label }
      : null,
    topics: String(row.topics_metadata ?? '')
      .split(',')
      .filter(Boolean)
      .map(value => {
        const [key, label] = value.split('\u001f')
        return { key, label }
      })
      .sort((first, second) => first.label.localeCompare(second.label, 'es', { sensitivity: 'base' }))
  }
  delete roadmap.module_search_text
  delete roadmap.category_key
  delete roadmap.category_label
  delete roadmap.topics_metadata
  delete roadmap.module_levels
  return roadmap
}

function metadataValues(value: unknown) {
  return String(value ?? '').split(',').filter(Boolean)
}

function matchesFilters(
  row: RoadmapSearchRow,
  filters?: RoadmapCatalogFilters,
  omitFamily?: CatalogFilterFamily
) {
  if (!filters) return true
  const topicKeys = metadataValues(row.topics_metadata).map(value => value.split('\u001f')[0])
  const levels = metadataValues(row.module_levels)
  const userProgressStatus = (row.user_progress_status as string) || 'not_started'

  return (omitFamily === 'categories' || !filters.categories.length || Boolean(row.category_key && filters.categories.includes(row.category_key))) &&
    (omitFamily === 'topics' || !filters.topics.length || filters.topics.some(topic => topicKeys.includes(topic))) &&
    (omitFamily === 'levels' || !filters.levels.length || filters.levels.some(level => levels.includes(level))) &&
    (omitFamily === 'progressStatuses' || !filters.progressStatuses.length || filters.progressStatuses.includes(userProgressStatus as any)) &&
    (omitFamily === 'durations' || roadmapDurationMatches(row.duration_weeks_min, row.duration_weeks_max, filters.durations))
}

export function matchesRoadmapSearch(row: RoadmapSearchRow, search?: RoadmapSearchQuery): boolean {
  if (!search?.normalizedQuery) return true
  return searchScore(row, search) !== null
}

function compareLabels(first: [string, string], second: [string, string]) {
  return first[1].localeCompare(second[1], 'es', { sensitivity: 'base' }) || first[0].localeCompare(second[0])
}

export function computeFilteredCatalogMetadata(
  visibleRows: RoadmapSearchRow[],
  search?: RoadmapSearchQuery,
  filters?: RoadmapCatalogFilters
) {
  const knownCategories = new Map<string, string>()
  const knownTopics = new Map<string, string>()

  visibleRows.forEach(row => {
    if (row.category_key && row.category_label) {
      knownCategories.set(row.category_key, row.category_label)
    }
    metadataValues(row.topics_metadata).forEach(entry => {
      const [key, label] = entry.split('\u001f')
      if (key && label) knownTopics.set(key, label)
    })
  })

  const searchRows = visibleRows.filter(row => matchesRoadmapSearch(row, search))

  const categoryCounts = new Map<string, number>()
  searchRows.filter(row => matchesFilters(row, filters, 'categories')).forEach(row => {
    if (!row.category_key) return
    categoryCounts.set(row.category_key, (categoryCounts.get(row.category_key) ?? 0) + 1)
  })

  const topicCounts = new Map<string, number>()
  searchRows.filter(row => matchesFilters(row, filters, 'topics')).forEach(row => {
    const keys = new Set(metadataValues(row.topics_metadata).map(value => value.split('\u001f')[0]).filter(Boolean))
    keys.forEach(key => {
      topicCounts.set(key, (topicCounts.get(key) ?? 0) + 1)
    })
  })

  const levelCounts = new Map<string, number>()
  searchRows.filter(row => matchesFilters(row, filters, 'levels')).forEach(row => {
    const levels = new Set(metadataValues(row.module_levels))
    levels.forEach(level => {
      levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1)
    })
  })

  const durationRows = searchRows.filter(row => matchesFilters(row, filters, 'durations'))
  let minWeeks: number | null = null
  let maxWeeks: number | null = null
  durationRows.forEach(row => {
    if (row.duration_weeks_min !== null && row.duration_weeks_min !== undefined) {
      const min = Number(row.duration_weeks_min)
      if (Number.isFinite(min)) minWeeks = minWeeks === null ? min : Math.min(minWeeks, min)
    }
    if (row.duration_weeks_max !== null && row.duration_weeks_max !== undefined) {
      const max = Number(row.duration_weeks_max)
      if (Number.isFinite(max)) maxWeeks = maxWeeks === null ? max : Math.max(maxWeeks, max)
    }
  })

  const progressCounts: Record<string, number> = {
    not_started: 0,
    in_progress: 0,
    completed: 0
  }
  searchRows.filter(row => matchesFilters(row, filters, 'progressStatuses')).forEach(row => {
    const status = (row.user_progress_status as string) || 'not_started'
    progressCounts[status] = (progressCounts[status] ?? 0) + 1
  })

  const unclassifiedRoadmaps = searchRows.filter(row => matchesFilters(row, filters) && !row.category_key).length

  return {
    categories: [...knownCategories.entries()]
      .sort(compareLabels)
      .map(([key, label]) => ({ key, label, roadmap_count: categoryCounts.get(key) ?? 0 })),
    topics: [...knownTopics.entries()]
      .sort(compareLabels)
      .map(([key, label]) => ({ key, label, roadmap_count: topicCounts.get(key) ?? 0 })),
    levels: MODULE_LEVELS.map(key => ({ key, roadmap_count: levelCounts.get(key) ?? 0 })),
    duration: { min_weeks: minWeeks, max_weeks: maxWeeks },
    duration_ranges: ROADMAP_DURATION_FILTERS.map(range => ({
      key: range.key,
      label: range.label,
      roadmap_count: durationRows.filter(row => roadmapDurationMatches(row.duration_weeks_min, row.duration_weeks_max, [range.key])).length
    })),
    progress_statuses: ROADMAP_PROGRESS_STATUS_FILTERS.map(item => ({
      key: item.key,
      label: item.label,
      roadmap_count: progressCounts[item.key] ?? 0
    })),
    unclassified_roadmaps: unclassifiedRoadmaps
  }
}

export function filterAndRankRoadmaps(
  rows: RoadmapSearchRow[],
  search: RoadmapSearchQuery,
  filters?: RoadmapCatalogFilters
) {
  const matchingRows = rows.filter(row => matchesFilters(row, filters))

  if (!search.normalizedQuery && (!filters || filters.sort === 'relevance')) {
    return matchingRows.map(toPublicRoadmap)
  }

  return matchingRows
    .map(row => ({ row, score: searchScore(row, search) }))
    .filter((item): item is { row: RoadmapSearchRow; score: number } => item.score !== null)
    .sort((first, second) => (
      filters?.sort === 'title'
        ? first.row.title.localeCompare(second.row.title, 'es', { sensitivity: 'base' }) || Number(first.row.id) - Number(second.row.id)
        : filters?.sort === 'duration'
          ? (first.row.duration_weeks_min ?? Number.POSITIVE_INFINITY) -
              (second.row.duration_weeks_min ?? Number.POSITIVE_INFINITY) ||
            first.row.title.localeCompare(second.row.title, 'es', { sensitivity: 'base' })
          : second.score - first.score ||
      first.row.title.localeCompare(second.row.title, 'es', { sensitivity: 'base' }) ||
      Number(second.row.id) - Number(first.row.id)
    ))
    .map(item => toPublicRoadmap(item.row))
}
