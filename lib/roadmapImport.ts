import {
  ModuleLevel,
  normalizeDurationRange,
  normalizeModuleLevel,
  normalizeTopics,
  parseDurationWeeks,
  saveRoadmapMetadata
} from './roadmapMetadata'
import { normalizePublishedAt, normalizeRoadmapVersion } from './roadmapVersion'

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

export async function persistRoadmapImport(
  db: any,
  roadmap: NormalizedRoadmapImport,
  strategy: RoadmapImportStrategy
) {
  await db.exec('BEGIN IMMEDIATE')
  try {
    const existing = await db.get('SELECT id FROM roadmaps WHERE title = ?', [roadmap.title])
    if (strategy === 'create' && existing) throw new RoadmapImportConflictError('already_exists')
    if (strategy === 'update' && !existing) throw new RoadmapImportConflictError('not_found')

    let roadmapId = existing?.id
    const roadmapValues = [
      roadmap.title,
      roadmap.description,
      roadmap.duration,
      roadmap.duration_weeks_min,
      roadmap.duration_weeks_max,
      JSON.stringify(roadmap.objectives),
      JSON.stringify(roadmap.methodology),
      JSON.stringify(roadmap.evaluation_weights),
      roadmap.version,
      roadmap.published_at
    ]
    if (roadmapId) {
      await db.run(
        `UPDATE roadmaps SET title = ?, description = ?, duration = ?, duration_weeks_min = ?,
         duration_weeks_max = ?, objectives = ?, methodology = ?, evaluation_weights = ?,
         version = ?, published_at = ? WHERE id = ?`,
        [...roadmapValues, roadmapId]
      )
    } else {
      const result = await db.run(
        `INSERT INTO roadmaps (
           title, description, duration, duration_weeks_min, duration_weeks_max,
           objectives, methodology, evaluation_weights, version, published_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        roadmapValues
      )
      roadmapId = result.lastID
    }

    await saveRoadmapMetadata(db, roadmapId, roadmap.category, roadmap.topics)
    let createdModules = 0
    let updatedModules = 0
    for (const moduleItem of roadmap.modules) {
      let moduleRow = await db.get(
        'SELECT id FROM modules WHERE roadmap_id = ? AND position = ?',
        [roadmapId, moduleItem.position]
      )
      if (!moduleRow) {
        moduleRow = await db.get(
          'SELECT id FROM modules WHERE roadmap_id = ? AND title = ?',
          [roadmapId, moduleItem.title]
        )
      }
      const values = [
        roadmapId,
        moduleItem.position,
        moduleItem.title,
        moduleItem.duration,
        moduleItem.duration_weeks_min,
        moduleItem.duration_weeks_max,
        moduleItem.level,
        moduleItem.objective,
        JSON.stringify(moduleItem.contents),
        moduleItem.importance,
        JSON.stringify(moduleItem.official_resources),
        JSON.stringify(moduleItem.support_videos),
        JSON.stringify(moduleItem.practical_activity),
        JSON.stringify(moduleItem.deliverable_evidence),
        moduleItem.evaluation,
        moduleItem.quiz.length ? JSON.stringify(moduleItem.quiz) : null
      ]
      if (moduleRow) {
        await db.run(
          `UPDATE modules SET roadmap_id = ?, position = ?, title = ?, duration = ?,
           duration_weeks_min = ?, duration_weeks_max = ?, level = ?, objective = ?, contents = ?,
           importance = ?, official_resources = ?, support_videos = ?, practical_activity = ?,
           deliverable_evidence = ?, evaluation = ?, quiz_bank = ? WHERE id = ?`,
          [...values, moduleRow.id]
        )
        updatedModules += 1
      } else {
        await db.run(
          `INSERT INTO modules (
             roadmap_id, position, title, duration, duration_weeks_min, duration_weeks_max,
             level, objective, contents, importance, official_resources, support_videos,
             practical_activity, deliverable_evidence, evaluation, quiz_bank
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          values
        )
        createdModules += 1
      }
    }

    await db.exec('COMMIT')
    return { roadmap_id: Number(roadmapId), created_modules: createdModules, updated_modules: updatedModules }
  } catch (error) {
    await db.exec('ROLLBACK')
    throw error
  }
}

function parseJsonArray(value: unknown): any[] {
  if (!value || typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseJsonObject(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export async function exportRoadmapAsJson(
  db: any,
  roadmapId: number | string
): Promise<NormalizedRoadmapImport | null> {
  const roadmap = await db.get(
    `SELECT
       roadmaps.*,
       roadmap_categories.label AS category_label
     FROM roadmaps
     LEFT JOIN roadmap_categories ON roadmap_categories.id = roadmaps.category_id
     WHERE roadmaps.id = ?`,
    [roadmapId]
  )

  if (!roadmap) return null

  const topicRows = await db.all(
    `SELECT topics.label
     FROM topics
     INNER JOIN roadmap_topics ON roadmap_topics.topic_id = topics.id
     WHERE roadmap_topics.roadmap_id = ?
     ORDER BY topics.label COLLATE NOCASE, topics.key`,
    [roadmapId]
  )
  const topics = topicRows.map((t: any) => String(t.label))

  const moduleRows = await db.all(
    `SELECT *
     FROM modules
     WHERE roadmap_id = ?
     ORDER BY COALESCE(position, id), id`,
    [roadmapId]
  )

  const modules = moduleRows.map((m: any, index: number) => ({
    position: m.position !== null && m.position !== undefined ? Number(m.position) : index,
    title: String(m.title || ''),
    level: m.level ? (String(m.level) as ModuleLevel) : null,
    duration: m.duration ? String(m.duration) : null,
    duration_weeks_min: m.duration_weeks_min !== null && m.duration_weeks_min !== undefined ? Number(m.duration_weeks_min) : null,
    duration_weeks_max: m.duration_weeks_max !== null && m.duration_weeks_max !== undefined ? Number(m.duration_weeks_max) : null,
    objective: m.objective ? String(m.objective) : null,
    contents: parseJsonArray(m.contents),
    importance: m.importance ? String(m.importance) : null,
    official_resources: parseJsonArray(m.official_resources),
    support_videos: parseJsonArray(m.support_videos),
    practical_activity: parseJsonArray(m.practical_activity),
    deliverable_evidence: parseJsonArray(m.deliverable_evidence),
    evaluation: m.evaluation ? String(m.evaluation) : null,
    quiz: parseJsonArray(m.quiz_bank)
  }))

  return {
    title: String(roadmap.title || ''),
    description: roadmap.description ? String(roadmap.description) : null,
    duration: roadmap.duration ? String(roadmap.duration) : null,
    duration_weeks_min: roadmap.duration_weeks_min !== null && roadmap.duration_weeks_min !== undefined ? Number(roadmap.duration_weeks_min) : null,
    duration_weeks_max: roadmap.duration_weeks_max !== null && roadmap.duration_weeks_max !== undefined ? Number(roadmap.duration_weeks_max) : null,
    category: roadmap.category_label ? String(roadmap.category_label) : null,
    topics,
    objectives: parseJsonArray(roadmap.objectives),
    methodology: parseJsonArray(roadmap.methodology),
    evaluation_weights: parseJsonObject(roadmap.evaluation_weights),
    version: String(roadmap.version || 'v1.0.0'),
    published_at: String(roadmap.published_at || new Date().toISOString()),
    modules
  }
}
