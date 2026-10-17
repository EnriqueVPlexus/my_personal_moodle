import { z } from 'zod'
import {
  MODULE_LEVELS,
  ModuleLevel,
  normalizeDurationRange,
  normalizeModuleLevel,
  normalizeTopics,
  parseDurationWeeks
} from './metadata'
import { DEFAULT_ROADMAP_VERSION } from './version'

/**
 * Zod schema of the roadmap JSON document accepted by the importer.
 *
 * Parsing it validates the document and, through `.transform`, produces the
 * `NormalizedRoadmapImport` the persistence layer consumes. Every message is
 * the Spanish text the admin sees in `pages/admin/import-roadmap.tsx`; do not
 * rely on Zod's default messages. See VALIDATION.md, "Importación".
 */

export type ImportLink = { label: string; url?: string }
export type ImportQuizQuestion = {
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

const MSG = {
  document: 'El JSON debe contener un objeto.',
  nonEmpty: 'Debe ser un texto no vacío.',
  text: 'Debe ser texto.',
  textList: 'Debe ser una lista de textos.',
  linkList: 'Debe ser una lista de recursos.',
  link: 'Debe ser texto o un objeto con label y url opcional.',
  url: 'La URL debe comenzar por http:// o https://.',
  weights: 'Debe ser un objeto de etiqueta y peso.',
  weight: 'Cada peso debe tener etiqueta y texto.',
  version: 'Debe usar el formato v1.0.0.',
  publishedAt: 'Debe ser una fecha ISO válida.',
  noModules: 'Debe incluir al menos un módulo.',
  tooManyModules: 'No puede incluir más de 100 módulos.',
  module: 'Cada módulo debe ser un objeto.',
  position: 'Debe ser un entero mayor o igual que cero.',
  positionRepeated: 'La posición está repetida.',
  level: 'Nivel permitido: beginner, intermediate, advanced o capstone.',
  weeks: 'El rango de semanas es inválido: el mínimo debe ser menor o igual al máximo.',
  quizList: 'Debe ser una lista de preguntas.',
  tooManyQuestions: 'No puede contener más de 100 preguntas.',
  question: 'Debe ser un objeto de pregunta.',
  questionType: 'Tipo permitido: multiple_choice, true_false o code_snippet.',
  options: 'Debe incluir entre 2 y 6 opciones.',
  answer: 'La respuesta debe coincidir con una de las opciones.',
  trueFalse: 'Las preguntas verdadero/falso deben tener exactamente 2 opciones.'
} as const

const tooLong = (max: number) => `No puede superar ${max} caracteres.`
const tooManyItems = (max: number) => `No puede contener más de ${max} elementos.`

/**
 * Size limits on an array. Zod's own `.min()/.max()` run on non-arrays (and
 * `.max()` makes Zod skip the elements once the array is too long), while the
 * importer reports the size and every element problem together, so the limits
 * are refinements that run after the elements and only on real arrays.
 */
function limitItems<T extends z.ZodArray>(schema: T, outOfRange: (length: number) => string | null, jsonSchema: Record<string, unknown>) {
  return schema
    .check(
      z.superRefine((value, ctx) => {
        const message = outOfRange(value.length)
        if (message) ctx.addIssue({ code: 'custom', message })
      }, { when: payload => Array.isArray(payload.value) })
    )
    .meta(jsonSchema)
}

const atMost = (max: number, message: string) => (length: number) => (length > max ? message : null)

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Cross-field rules must still report when sibling fields already failed (the
 * admin gets every problem in one pass), so they run unless the value is not an
 * object at all. Zod would otherwise skip them after any type error.
 */
const WHEN_RECORD = { when: (payload: { value: unknown }) => isRecord(payload.value) }

/** Trimmed, non-empty text without an upper bound (list items, options). */
const nonEmptyText = z.string({ error: MSG.nonEmpty }).trim().min(1, MSG.nonEmpty)

/** Required text: trimmed, non-empty, at most `max` characters. */
function requiredText(max: number) {
  return nonEmptyText.max(max, tooLong(max))
}

/** Optional text: `null`/`''`/blank become `null`; anything but text is rejected. */
function optionalText(max: number) {
  return z.string({ error: MSG.text }).trim().max(max, tooLong(max)).nullish().transform(value => value || null)
}

/** Optional list of non-empty texts. */
function textList(max = 100) {
  return limitItems(z.array(nonEmptyText, { error: MSG.textList }), atMost(max, tooManyItems(max)), { maxItems: max })
    .optional()
    .transform(value => value ?? [])
}

const linkObject = z.object(
  {
    label: requiredText(300),
    url: z
      .string({ error: MSG.text })
      .trim()
      .max(2000, tooLong(2000))
      .refine(value => value === '' || /^https?:\/\//i.test(value), MSG.url)
      .nullish()
      .transform(value => value || null)
  },
  { error: MSG.link }
)

/** A link is a non-empty string (the label) or `{ label, url? }`. */
const link = z
  .preprocess(value => (typeof value === 'string' && value.trim() ? { label: value.trim() } : value), linkObject)
  .transform((value): ImportLink => ({ label: value.label, ...(value.url ? { url: value.url } : {}) }))

const linkList = z
  .array(link, { error: MSG.linkList })
  .meta({ description: 'Cada recurso es un texto (su `label`) o un objeto `{ label, url? }`; `url` debe comenzar por http:// o https://.' })
  .optional()
  .transform(value => value ?? [])

const evaluationWeights = z
  .record(z.string().trim().min(1, MSG.weight), z.string({ error: MSG.weight }).trim().min(1, MSG.weight), {
    error: issue => (issue.code === 'invalid_key' ? MSG.weight : issue.code === 'invalid_type' ? MSG.weights : undefined)
  })
  .optional()
  .transform(value => value ?? {})

const version = z
  .string({ error: MSG.version })
  .refine(value => value === '' || /^v\d+\.\d+\.\d+$/.test(value.trim()), MSG.version)
  .nullish()
  .transform(value => (value ? value.trim() : DEFAULT_ROADMAP_VERSION))
  .meta({ pattern: '^v\\d+\\.\\d+\\.\\d+$' })

const publishedAt = z
  .string({ error: MSG.publishedAt })
  .refine(value => value === '' || !Number.isNaN(Date.parse(value)), MSG.publishedAt)
  .nullish()
  .transform(value => (value ? new Date(value).toISOString() : new Date().toISOString()))
  .meta({ format: 'date-time' })

/** The trimmed text of a field that may have failed validation (then it is raw input). */
function textOrNull(value: unknown) {
  return typeof value === 'string' ? value.trim() || null : null
}

/**
 * Week range of a module or of the whole roadmap, from the first source that
 * is present: explicit `duration_weeks_min`/`_max`, then `duration_weeks`, then
 * the free-text `duration`. `null` means the explicit range is invalid.
 */
function resolveWeeks(source: Record<string, unknown>, duration: string | null) {
  const hasRange = source.duration_weeks_min !== undefined || source.duration_weeks_max !== undefined
  const durationWeeks = source.duration_weeks
  if (hasRange) return normalizeDurationRange(source.duration_weeks_min, source.duration_weeks_max)
  if (durationWeeks !== undefined) return normalizeDurationRange(durationWeeks, durationWeeks)
  return parseDurationWeeks(duration)
}

const weeksField = (description: string) =>
  z.unknown().optional().meta({ type: 'number', minimum: 0, description })

function checkWeeks(source: Record<string, unknown>, ctx: z.core.$RefinementCtx) {
  if (!resolveWeeks(source, textOrNull(source.duration))) {
    ctx.addIssue({ code: 'custom', message: MSG.weeks, path: ['duration_weeks'] })
  }
}

// --- Quiz ---------------------------------------------------------------

/** 2 to 6 options; when the count is wrong the individual options are not reported. */
const questionOptions = limitItems(
  z.array(z.unknown(), { error: MSG.options }),
  length => (length < 2 || length > 6 ? MSG.options : null),
  { items: { type: 'string', minLength: 1 }, minItems: 2, maxItems: 6 }
).pipe(z.array(nonEmptyText))

function questionShape<S extends z.ZodType>(type: S) {
  return {
    type,
    question: requiredText(1000),
    answer: requiredText(500),
    explanation: optionalExplanation(),
    feedback: z.unknown().optional().meta({ type: 'string', description: 'Alias de `explanation`; se usa solo si `explanation` falta o es `null`.' }),
    options: questionOptions
  }
}

function optionalExplanation() {
  return z.string({ error: MSG.text }).trim().max(2000, tooLong(2000)).nullish()
}

/**
 * Rules that involve several fields of one question:
 * - `answer` must equal (ignoring case) one of the valid options;
 * - `true_false` questions need exactly 2 valid options;
 * - `feedback` is validated as the explanation when `explanation` is missing.
 * They are skipped for the answer/options when the option count was wrong.
 */
function checkQuestion(question: Record<string, unknown>, ctx: z.core.$RefinementCtx, trueFalse: boolean) {
  if (question.explanation == null && question.feedback != null) {
    const feedback = question.feedback
    if (typeof feedback !== 'string') {
      ctx.addIssue({ code: 'custom', message: MSG.text, path: ['explanation'] })
    } else if (feedback.trim().length > 2000) {
      ctx.addIssue({ code: 'custom', message: tooLong(2000), path: ['explanation'] })
    }
  }

  const options = question.options
  if (!Array.isArray(options) || options.length < 2 || options.length > 6) return
  const valid = options.flatMap(option => (typeof option === 'string' && option.trim() ? [option.trim()] : []))
  const answer = typeof question.answer === 'string' ? question.answer.trim().toLowerCase() : ''
  if (!valid.some(option => option.toLowerCase() === answer)) {
    ctx.addIssue({ code: 'custom', message: MSG.answer, path: ['answer'] })
  }
  if (trueFalse && valid.length !== 2) {
    ctx.addIssue({ code: 'custom', message: MSG.trueFalse, path: ['options'] })
  }
}

function questionMember<T extends 'multiple_choice' | 'true_false' | 'code_snippet'>(type: T, defaultType = false) {
  const literal = z.literal(type, { error: MSG.questionType })
  return z
    .object(questionShape(defaultType ? literal.optional() : literal))
    .check(z.superRefine((question, ctx) => checkQuestion(question, ctx, type === 'true_false'), WHEN_RECORD))
}

const quizQuestion = z
  .discriminatedUnion(
    'type',
    [questionMember('multiple_choice', true), questionMember('true_false'), questionMember('code_snippet')],
    { error: issue => ((issue.code as string) === 'invalid_type' ? MSG.question : MSG.questionType) }
  )
  .transform((question): ImportQuizQuestion => {
    const feedback = typeof question.feedback === 'string' ? question.feedback.trim() : null
    return {
      question: question.question,
      answer: question.answer,
      options: question.options,
      explanation: (question.explanation ?? feedback) || null,
      type: question.type ?? 'multiple_choice'
    }
  })

const quiz = limitItems(z.array(quizQuestion, { error: MSG.quizList }), atMost(100, MSG.tooManyQuestions), { maxItems: 100 })
  .optional()
  .transform(value => value ?? [])

// --- Modules ------------------------------------------------------------

/** Level names, case-insensitive, plus the `beginner-intermediate` style aliases. Falsy values mean "no level". */
const level = z
  .preprocess(
    value => {
      if (value === undefined || value === null || value === '') return null
      return normalizeModuleLevel(value) ?? (value || null)
    },
    z.enum(MODULE_LEVELS, { error: MSG.level }).nullable()
  )
  .optional()
  .meta({ enum: [...MODULE_LEVELS, null], description: 'También se aceptan mayúsculas y los alias `beginner-intermediate` e `intermediate-advanced`.' })

const importModule = z
  .object(
    {
      position: z
        .unknown()
        .optional()
        .meta({ type: 'integer', minimum: 0, description: 'Posición del módulo; sin ella se usa su índice. No puede repetirse.' }),
      title: requiredText(200),
      level,
      duration: optionalText(150),
      duration_weeks_min: weeksField('Semanas mínimas del módulo.'),
      duration_weeks_max: weeksField('Semanas máximas del módulo.'),
      duration_weeks: weeksField('Semanas del módulo (equivale a mínimo y máximo iguales).'),
      objective: optionalText(5000),
      contents: textList(),
      importance: optionalText(5000),
      official_resources: linkList,
      support_videos: linkList,
      practical_activity: textList(),
      deliverable_evidence: textList(),
      evaluation: optionalText(5000),
      quiz
    },
    { error: MSG.module }
  )
  .check(z.superRefine((module, ctx) => checkWeeks(module, ctx), WHEN_RECORD))
  .transform(module => {
    const weeks = resolveWeeks(module, textOrNull(module.duration)) ?? { min: null, max: null }
    return {
      position: module.position,
      title: module.title,
      level: (module.level ?? null) as ModuleLevel | null,
      duration: module.duration,
      duration_weeks_min: weeks.min,
      duration_weeks_max: weeks.max,
      objective: module.objective,
      contents: module.contents,
      importance: module.importance,
      official_resources: module.official_resources,
      support_videos: module.support_videos,
      practical_activity: module.practical_activity,
      deliverable_evidence: module.deliverable_evidence,
      evaluation: module.evaluation,
      quiz: module.quiz
    }
  })

/** Explicit position of each module, or its index; both must be unique integers >= 0. */
function checkPositions(modules: unknown[], ctx: z.core.$RefinementCtx) {
  const seen = new Set<number>()
  modules.forEach((module, index) => {
    if (!isRecord(module)) return
    const position = Number(module.position ?? index)
    if (!Number.isInteger(position) || position < 0) {
      ctx.addIssue({ code: 'custom', message: MSG.position, path: [index, 'position'] })
    }
    if (seen.has(position)) ctx.addIssue({ code: 'custom', message: MSG.positionRepeated, path: [index, 'position'] })
    seen.add(position)
  })
}

const modules = limitItems(
  z.array(importModule, { error: MSG.noModules }),
  length => (length === 0 ? MSG.noModules : length > 100 ? MSG.tooManyModules : null),
  { minItems: 1, maxItems: 100 }
)
  .check(z.superRefine((value, ctx) => checkPositions(value, ctx), { when: payload => Array.isArray(payload.value) }))
  .transform(value => value.map((module, index) => ({ ...module, position: Number(module.position ?? index) })))

// --- Roadmap ------------------------------------------------------------

export const roadmapImportSchema = z
  .object(
    {
      title: requiredText(200),
      description: optionalText(5000),
      duration: optionalText(150),
      category: optionalText(100),
      topics: textList(20),
      objectives: textList(),
      methodology: textList(),
      evaluation_weights: evaluationWeights,
      version,
      published_at: publishedAt,
      duration_weeks_min: weeksField('Semanas mínimas del roadmap; si falta se suman las de los módulos.'),
      duration_weeks_max: weeksField('Semanas máximas del roadmap; si falta se suman las de los módulos.'),
      duration_weeks: weeksField('Semanas del roadmap (equivale a mínimo y máximo iguales).'),
      modules
    },
    { error: MSG.document }
  )
  .check(z.superRefine((roadmap, ctx) => checkWeeks(roadmap, ctx), WHEN_RECORD))
  .transform((roadmap): NormalizedRoadmapImport => {
    const explicit = resolveWeeks(roadmap, roadmap.duration) ?? { min: null, max: null }
    const total = roadmap.modules.reduce(
      (sum, module) => ({
        min: sum.min + (module.duration_weeks_min ?? 0),
        max: sum.max + (module.duration_weeks_max ?? 0)
      }),
      { min: 0, max: 0 }
    )
    return {
      title: roadmap.title,
      description: roadmap.description,
      duration: roadmap.duration,
      duration_weeks_min: explicit.min ?? (total.min || null),
      duration_weeks_max: explicit.max ?? (total.max || null),
      category: roadmap.category,
      topics: normalizeTopics(roadmap.topics),
      objectives: roadmap.objectives,
      methodology: roadmap.methodology,
      evaluation_weights: roadmap.evaluation_weights,
      version: roadmap.version,
      published_at: roadmap.published_at,
      modules: roadmap.modules
    }
  })
