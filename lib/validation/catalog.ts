import { z } from 'zod'
import { MAX_ROADMAP_SEARCH_QUERY_LENGTH, parseRoadmapSearchQuery } from '../roadmapSearch'
import { queryObject } from './primitives'

const MAX_FILTER_VALUE_LENGTH = 500
const MAX_FILTER_VALUES = 50

const filterValue = z
  .union(
    [
      z.string().max(MAX_FILTER_VALUE_LENGTH),
      z.array(z.string().max(MAX_FILTER_VALUE_LENGTH)).max(MAX_FILTER_VALUES)
    ],
    { error: 'Los filtros del catálogo no son válidos.' }
  )
  .optional()

// Unknown filter values are ignored by parseRoadmapCatalogFilters (links with stale
// filters keep working); this only guards types and sizes before they reach it.
export const roadmapCatalogQuerySchema = queryObject({
  q: filterValue.superRefine((value, ctx) => {
    if (parseRoadmapSearchQuery(value).tooLong) {
      ctx.addIssue({
        code: 'custom',
        message: `La búsqueda no puede superar ${MAX_ROADMAP_SEARCH_QUERY_LENGTH} caracteres.`
      })
    }
  }),
  category: filterValue,
  topic: filterValue,
  level: filterValue,
  duration: filterValue,
  progress_status: filterValue,
  status: filterValue,
  sort: filterValue
})

export type RoadmapCatalogQuery = z.infer<typeof roadmapCatalogQuerySchema>
