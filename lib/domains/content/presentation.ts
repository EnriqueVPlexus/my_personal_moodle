export type LearningLink = {
  label: string
  url?: string
}

export type EvaluationWeight = {
  label: string
  value: string
}

export type LearningModule = {
  id?: number
  position?: number | null
  title: string
  duration?: string | null
  duration_weeks_min?: number | null
  duration_weeks_max?: number | null
  level?: 'beginner' | 'intermediate' | 'advanced' | 'capstone' | null
  objective?: string | null
  contents?: unknown
  importance?: string | null
  official_resources?: unknown
  support_videos?: unknown
  practical_activity?: unknown
  deliverable_evidence?: unknown
  evaluation?: string | null
}

export function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value !== 'string') return value as T

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function asTextList(value: unknown): string[] {
  const parsed = parseJsonValue<unknown>(value, value)
  if (Array.isArray(parsed)) return parsed.map(String)
  if (typeof parsed === 'string' && parsed.trim()) return [parsed]
  return []
}

export function asLearningLinks(value: unknown): LearningLink[] {
  const parsed = parseJsonValue<unknown>(value, value)

  if (!Array.isArray(parsed)) {
    return typeof parsed === 'string' && parsed.trim() ? [{ label: parsed }] : []
  }

  return parsed
    .map(item => {
      if (typeof item === 'string') return { label: item }
      if (item && typeof item === 'object' && 'label' in item) {
        const link = item as LearningLink
        return { label: link.label, url: link.url }
      }
      return null
    })
    .filter((item): item is LearningLink => Boolean(item?.label))
}

export function asEvaluationWeights(value: unknown): EvaluationWeight[] {
  const parsed = parseJsonValue<Record<string, string>>(value, {})
  return Object.entries(parsed).map(([label, weight]) => ({ label, value: weight }))
}
