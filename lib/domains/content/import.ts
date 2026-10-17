import { roadmapImportSchema, type NormalizedRoadmapImport } from './importSchema'

export type { ImportLink, ImportQuizQuestion, NormalizedRoadmapImport } from './importSchema'

export type RoadmapImportStrategy = 'create' | 'update'

export type RoadmapImportIssue = {
  path: string
  message: string
}

export type RoadmapImportValidation = {
  valid: boolean
  issues: RoadmapImportIssue[]
  roadmap: NormalizedRoadmapImport | null
}

/** Zod issue path (`['modules', 0, 'title']`) as the admin reads it: `modules[0].title`. */
function formatPath(path: ReadonlyArray<PropertyKey>) {
  if (path.length === 0) return '$'
  return path.reduce<string>((result, segment) => {
    if (typeof segment === 'number') return `${result}[${segment}]`
    const key = String(segment) || '?'
    return result ? `${result}.${key}` : key
  }, '')
}

/**
 * Validates and normalizes a roadmap JSON document. The rules live in
 * `roadmapImportSchema`; this wrapper keeps the `{ valid, issues, roadmap }`
 * result the importer and the admin screen consume.
 */
export function validateRoadmapImport(input: unknown): RoadmapImportValidation {
  const parsed = roadmapImportSchema.safeParse(input)
  if (parsed.success) return { valid: true, issues: [], roadmap: parsed.data }
  return {
    valid: false,
    issues: parsed.error.issues.map(issue => ({ path: formatPath(issue.path), message: issue.message })),
    roadmap: null
  }
}

export class RoadmapImportConflictError extends Error {
  constructor(public code: 'already_exists' | 'not_found') {
    super(code)
  }
}
