export const MAX_ROADMAP_SEARCH_QUERY_LENGTH = 100

export const ROADMAP_CATALOG_SEARCH_SQL = `
  SELECT
    roadmaps.*,
    roadmap_categories.key AS category_key,
    roadmap_categories.label AS category_label,
    COUNT(DISTINCT modules.id) AS module_count,
    GROUP_CONCAT(DISTINCT topics.key || char(31) || topics.label) AS topics_metadata,
    COALESCE(GROUP_CONCAT(
      COALESCE(modules.title, '') || ' ' ||
      COALESCE(modules.objective, '') || ' ' ||
      COALESCE(modules.contents, ''),
      ' '
    ), '') AS module_search_text
  FROM roadmaps
  LEFT JOIN roadmap_categories ON roadmap_categories.id = roadmaps.category_id
  LEFT JOIN modules ON modules.roadmap_id = roadmaps.id
  LEFT JOIN roadmap_topics ON roadmap_topics.roadmap_id = roadmaps.id
  LEFT JOIN topics ON topics.id = roadmap_topics.topic_id
  GROUP BY roadmaps.id
  ORDER BY roadmaps.id DESC
`

export type RoadmapSearchQuery = {
  query: string
  normalizedQuery: string
  terms: string[]
  tooLong: boolean
}

type RoadmapSearchRow = {
  id: number
  title: string
  description?: string | null
  objectives?: string | null
  methodology?: string | null
  module_search_text?: string | null
  category_key?: string | null
  category_label?: string | null
  topics_metadata?: string | null
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
  return roadmap
}

export function filterAndRankRoadmaps(rows: RoadmapSearchRow[], search: RoadmapSearchQuery) {
  if (!search.normalizedQuery) return rows.map(toPublicRoadmap)

  return rows
    .map(row => ({ row, score: searchScore(row, search) }))
    .filter((item): item is { row: RoadmapSearchRow; score: number } => item.score !== null)
    .sort((first, second) => (
      second.score - first.score ||
      first.row.title.localeCompare(second.row.title, 'es', { sensitivity: 'base' }) ||
      Number(second.row.id) - Number(first.row.id)
    ))
    .map(item => toPublicRoadmap(item.row))
}
