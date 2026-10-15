import {
  ModuleLevel,
  normalizeDurationRange,
  normalizeModuleLevel,
  normalizeTopics,
  parseDurationWeeks
} from './metadata'
import { normalizePublishedAt, normalizeRoadmapVersion } from './version'

export type RoadmapImportStrategy = 'create' | 'update'

export type RoadmapImportIssue = {
  path: string
  message: string
}

type ImportLink = { label: string; url?: string }
type ImportQuizQuestion = {
  question: string
  answer: string
  options: string[]
  explanation: string | null
  type: 'multiple_choice' | 'true_false' | 'code_snippet'
}

export type NormalizedRoadmapImport = {
  title: string
  description: string | null
  duration: string | null
  duration_weeks_min: number | null
  duration_weeks_max: number | null
  category: string | null
  topics: string[]
  objectives: string[]
  methodology: string[]
  evaluation_weights: Record<string, string>
  version: string
  published_at: string
  modules: Array<{
    position: number
    title: string
    level: ModuleLevel | null
    duration: string | null
    duration_weeks_min: number | null
    duration_weeks_max: number | null
    objective: string | null
    contents: string[]
    importance: string | null
    official_resources: ImportLink[]
    support_videos: ImportLink[]
    practical_activity: string[]
    deliverable_evidence: string[]
    evaluation: string | null
    quiz: ImportQuizQuestion[]
  }>
}

export type RoadmapImportValidation = {
  valid: boolean
  issues: RoadmapImportIssue[]
  roadmap: NormalizedRoadmapImport | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requiredText(
  value: unknown,
  path: string,
  issues: RoadmapImportIssue[],
  maxLength = 500
) {
  if (typeof value !== 'string' || !value.trim()) {
    issues.push({ path, message: 'Debe ser un texto no vacío.' })
    return ''
  }
  const normalized = value.trim()
  if (normalized.length > maxLength) issues.push({ path, message: `No puede superar ${maxLength} caracteres.` })
  return normalized
}

function optionalText(value: unknown, path: string, issues: RoadmapImportIssue[], maxLength = 5000) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') {
    issues.push({ path, message: 'Debe ser texto.' })
    return null
  }
  const normalized = value.trim()
  if (normalized.length > maxLength) issues.push({ path, message: `No puede superar ${maxLength} caracteres.` })
  return normalized || null
}

function textList(value: unknown, path: string, issues: RoadmapImportIssue[], maxItems = 100) {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Debe ser una lista de textos.' })
    return []
  }
  if (value.length > maxItems) issues.push({ path, message: `No puede contener más de ${maxItems} elementos.` })
  return value.flatMap((item, index) => {
    if (typeof item !== 'string' || !item.trim()) {
      issues.push({ path: `${path}[${index}]`, message: 'Debe ser un texto no vacío.' })
      return []
    }
    return [item.trim()]
  })
}

function links(value: unknown, path: string, issues: RoadmapImportIssue[]) {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Debe ser una lista de recursos.' })
    return []
  }
  return value.flatMap((item, index): ImportLink[] => {
    const itemPath = `${path}[${index}]`
    if (typeof item === 'string' && item.trim()) return [{ label: item.trim() }]
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: 'Debe ser texto o un objeto con label y url opcional.' })
      return []
    }
    const label = requiredText(item.label, `${itemPath}.label`, issues, 300)
    const url = optionalText(item.url, `${itemPath}.url`, issues, 2000)
    if (url && !/^https?:\/\//i.test(url)) {
      issues.push({ path: `${itemPath}.url`, message: 'La URL debe comenzar por http:// o https://.' })
    }
    return label ? [{ label, ...(url ? { url } : {}) }] : []
  })
}

function quiz(value: unknown, path: string, issues: RoadmapImportIssue[]): ImportQuizQuestion[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Debe ser una lista de preguntas.' })
    return []
  }
  if (value.length > 100) issues.push({ path, message: 'No puede contener más de 100 preguntas.' })

  return value.flatMap((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: 'Debe ser un objeto de pregunta.' })
      return []
    }
    const question = requiredText(item.question, `${itemPath}.question`, issues, 1000)
    const answer = requiredText(item.answer, `${itemPath}.answer`, issues, 500)
    const explanation = optionalText(item.explanation ?? item.feedback, `${itemPath}.explanation`, issues, 2000)
    const type = item.type === undefined ? 'multiple_choice' : item.type
    if (!['multiple_choice', 'true_false', 'code_snippet'].includes(String(type))) {
      issues.push({ path: `${itemPath}.type`, message: 'Tipo permitido: multiple_choice, true_false o code_snippet.' })
    }
    if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 6) {
      issues.push({ path: `${itemPath}.options`, message: 'Debe incluir entre 2 y 6 opciones.' })
      return []
    }
    const options = item.options.flatMap((option, optionIndex) => {
      if (typeof option !== 'string' || !option.trim()) {
        issues.push({ path: `${itemPath}.options[${optionIndex}]`, message: 'Debe ser un texto no vacío.' })
        return []
      }
      return [option.trim()]
    })
    if (!options.some(option => option.toLowerCase() === answer.toLowerCase())) {
      issues.push({ path: `${itemPath}.answer`, message: 'La respuesta debe coincidir con una de las opciones.' })
    }
    if (type === 'true_false' && options.length !== 2) {
      issues.push({ path: `${itemPath}.options`, message: 'Las preguntas verdadero/falso deben tener exactamente 2 opciones.' })
    }
    return question && answer ? [{ question, answer, options, explanation, type: type as ImportQuizQuestion['type'] }] : []
  })
}

function evaluationWeights(value: unknown, issues: RoadmapImportIssue[]) {
  if (value === undefined) return {}
  if (!isRecord(value)) {
    issues.push({ path: 'evaluation_weights', message: 'Debe ser un objeto de etiqueta y peso.' })
    return {}
  }
  const result: Record<string, string> = {}
  Object.entries(value).forEach(([label, weight]) => {
    if (!label.trim() || typeof weight !== 'string' || !weight.trim()) {
      issues.push({ path: `evaluation_weights.${label || '?'}`, message: 'Cada peso debe tener etiqueta y texto.' })
      return
    }
    result[label.trim()] = weight.trim()
  })
  return result
}

function comparableDuration(
  source: Record<string, unknown>,
  duration: string | null,
  path: string,
  issues: RoadmapImportIssue[]
) {
  const hasRange = source.duration_weeks_min !== undefined || source.duration_weeks_max !== undefined
  const durationWeeks = source.duration_weeks
  const range = hasRange
    ? normalizeDurationRange(source.duration_weeks_min, source.duration_weeks_max)
    : durationWeeks !== undefined
      ? normalizeDurationRange(durationWeeks, durationWeeks)
      : parseDurationWeeks(duration)
  if (!range) {
    issues.push({ path, message: 'El rango de semanas es inválido: el mínimo debe ser menor o igual al máximo.' })
    return { min: null, max: null }
  }
  return range
}

export function validateRoadmapImport(input: unknown): RoadmapImportValidation {
  const issues: RoadmapImportIssue[] = []
  if (!isRecord(input)) {
    return { valid: false, issues: [{ path: '$', message: 'El JSON debe contener un objeto.' }], roadmap: null }
  }

  const title = requiredText(input.title, 'title', issues, 200)
  const description = optionalText(input.description, 'description', issues)
  const duration = optionalText(input.duration, 'duration', issues, 150)
  const category = optionalText(input.category, 'category', issues, 100)
  const topics = normalizeTopics(textList(input.topics, 'topics', issues, 20))
  const objectives = textList(input.objectives, 'objectives', issues)
  const methodology = textList(input.methodology, 'methodology', issues)
  const weights = evaluationWeights(input.evaluation_weights, issues)
  const version = normalizeRoadmapVersion(input.version)
  const publishedAt = normalizePublishedAt(input.published_at)
  if (!version) issues.push({ path: 'version', message: 'Debe usar el formato v1.0.0.' })
  if (!publishedAt) issues.push({ path: 'published_at', message: 'Debe ser una fecha ISO válida.' })

  if (!Array.isArray(input.modules) || input.modules.length === 0) {
    issues.push({ path: 'modules', message: 'Debe incluir al menos un módulo.' })
  } else if (input.modules.length > 100) {
    issues.push({ path: 'modules', message: 'No puede incluir más de 100 módulos.' })
  }

  const positions = new Set<number>()
  const modules = (Array.isArray(input.modules) ? input.modules : []).flatMap((value, index) => {
    const path = `modules[${index}]`
    if (!isRecord(value)) {
      issues.push({ path, message: 'Cada módulo debe ser un objeto.' })
      return []
    }
    const rawPosition = value.position ?? index
    const position = Number(rawPosition)
    if (!Number.isInteger(position) || position < 0) issues.push({ path: `${path}.position`, message: 'Debe ser un entero mayor o igual que cero.' })
    if (positions.has(position)) issues.push({ path: `${path}.position`, message: 'La posición está repetida.' })
    positions.add(position)
    const moduleDuration = optionalText(value.duration, `${path}.duration`, issues, 150)
    const durationRange = comparableDuration(value, moduleDuration, `${path}.duration_weeks`, issues)
    const level = value.level === undefined || value.level === null || value.level === ''
      ? null
      : normalizeModuleLevel(value.level)
    if (value.level && !level) issues.push({ path: `${path}.level`, message: 'Nivel permitido: beginner, intermediate, advanced o capstone.' })

    return [{
      position,
      title: requiredText(value.title, `${path}.title`, issues, 200),
      level,
      duration: moduleDuration,
      duration_weeks_min: durationRange.min,
      duration_weeks_max: durationRange.max,
      objective: optionalText(value.objective, `${path}.objective`, issues),
      contents: textList(value.contents, `${path}.contents`, issues),
      importance: optionalText(value.importance, `${path}.importance`, issues),
      official_resources: links(value.official_resources, `${path}.official_resources`, issues),
      support_videos: links(value.support_videos, `${path}.support_videos`, issues),
      practical_activity: textList(value.practical_activity, `${path}.practical_activity`, issues),
      deliverable_evidence: textList(value.deliverable_evidence, `${path}.deliverable_evidence`, issues),
      evaluation: optionalText(value.evaluation, `${path}.evaluation`, issues),
      quiz: quiz(value.quiz, `${path}.quiz`, issues)
    }]
  })

  const explicitDuration = comparableDuration(input, duration, 'duration_weeks', issues)
  const moduleDuration = modules.reduce((total, module) => ({
    min: total.min + (module.duration_weeks_min ?? 0),
    max: total.max + (module.duration_weeks_max ?? 0)
  }), { min: 0, max: 0 })
  const durationMin = explicitDuration.min ?? (moduleDuration.min || null)
  const durationMax = explicitDuration.max ?? (moduleDuration.max || null)

  const roadmap: NormalizedRoadmapImport = {
    title,
    description,
    duration,
    duration_weeks_min: durationMin,
    duration_weeks_max: durationMax,
    category,
    topics,
    objectives,
    methodology,
    evaluation_weights: weights,
    version: version || 'v1.0.0',
    published_at: publishedAt || new Date().toISOString(),
    modules
  }

  return { valid: issues.length === 0, issues, roadmap: issues.length === 0 ? roadmap : null }
}

export class RoadmapImportConflictError extends Error {
  constructor(public code: 'already_exists' | 'not_found') {
    super(code)
  }
}
