import { asLearningLinks, asTextList } from './roadmapPresentation'

type DbHandle = {
  get: (sql: string, params?: any[]) => Promise<any>
  all: (sql: string, params?: any[]) => Promise<any[]>
  run: (sql: string, params?: any[]) => Promise<any>
}

type ModuleQuizSource = {
  id: number
  roadmap_id?: number | null
  title: string
  contents?: unknown
  official_resources?: unknown
  practical_activity?: unknown
  deliverable_evidence?: unknown
  evaluation?: string | null
  quiz_bank?: string | null
  quiz_pass_percentage?: number | null
  quiz_max_attempts?: number | null
  quiz_cooldown_minutes?: number | null
}

export type QuestionType = 'multiple_choice' | 'true_false' | 'code_snippet'

export type ModuleQuizQuestion = {
  id: string
  type: QuestionType
  prompt: string
  options: string[]
  correct_option_index: number
  explanation: string
}

export type PublicModuleQuizQuestion = Omit<ModuleQuizQuestion, 'correct_option_index'>

export type ModuleQuiz = {
  scope: 'module'
  module_id: number
  roadmap_id?: number | null
  title: string
  questions: ModuleQuizQuestion[]
}

export type PublicModuleQuiz = Omit<ModuleQuiz, 'questions'> & {
  questions: PublicModuleQuizQuestion[]
}

export type QuizFeedbackItem = {
  question_id: string
  prompt: string
  selected_option_index: number | null
  selected_option?: string | null
  correct_option_index: number
  correct_option: string
  is_correct: boolean
  explanation: string
}

export type QuizGrade = {
  score: number
  max_score: number
  percentage: number
  passed: boolean
  feedback: QuizFeedbackItem[]
}

export type ModuleQuizSummary = {
  attempts_count: number
  average_score_percentage?: number | null
  best_score_percentage?: number | null
  latest_attempt?: {
    score: number
    max_score: number
    percentage: number
    submitted_at: string
  } | null
}

export type AttemptEligibility = {
  allowed: boolean
  remaining_attempts?: number | null
  cooldown_ends_at?: string | null
  pass_percentage: number
}

const PASSING_PERCENTAGE = 70

const DISTRACTORS = [
  'Configurar un proceso administrativo ajeno al roadmap',
  'Publicar una campana de marketing',
  'Editar un documento sin relacion tecnica',
  'Revisar metricas no conectadas con el modulo',
  'Crear una presentacion comercial generica'
]

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function shortText(value: unknown) {
  const cleaned = cleanText(value)
  return cleaned.length > 140 ? `${cleaned.slice(0, 137)}...` : cleaned
}

function unique(values: string[]) {
  const seen = new Set<string>()
  return values.filter(value => {
    const key = value.toLowerCase()
    if (!value || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildOptions(correct: string, candidates: string[], seed: number) {
  const wrongOptions = unique([...candidates, ...DISTRACTORS]
    .map(shortText)
    .filter(option => option.toLowerCase() !== correct.toLowerCase()))
    .slice(0, 3)
  const options = [...wrongOptions]
  const correctIndex = seed % (options.length + 1)
  options.splice(correctIndex, 0, correct)

  return { options, correctIndex }
}

function buildQuestion(
  id: string,
  prompt: string,
  correct: string,
  candidates: string[],
  seed: number,
  explanation: string,
  type: QuestionType = 'multiple_choice'
): ModuleQuizQuestion {
  const options = buildOptions(shortText(correct), candidates, seed)

  return {
    id,
    type,
    prompt,
    options: options.options,
    correct_option_index: options.correctIndex,
    explanation
  }
}

function buildTrueFalseQuestion(
  id: string,
  prompt: string,
  isTrue: boolean,
  explanation: string
): ModuleQuizQuestion {
  const correctIndex = isTrue ? 0 : 1
  return {
    id,
    type: 'true_false',
    prompt,
    options: ['Verdadero', 'Falso'],
    correct_option_index: correctIndex,
    explanation
  }
}

// ─── Fase 2: banco de preguntas con seeded shuffle ───────────────────────────

/** Murmur2-like hash numérico para producir un seed determinista. */
function hashSeed(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0
  }
  return Math.abs(h)
}

/** Fisher-Yates shuffle determinista con un entero como seed. */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    const j = Math.abs(s) % (i + 1);[
      a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

type BankEntry = {
  question: string
  answer: string
  options?: string[]
  explanation?: string
  feedback?: string
  type?: QuestionType
}

/**
 * Construye preguntas de opción múltiple a partir del banco persitido.
 * Usa un seed derivado de module_id para selección reproducible.
 */
export function buildQuizFromBank(
  bank: BankEntry[],
  moduleId: number,
  maxQuestions = 5
): ModuleQuizQuestion[] {
  if (!bank.length) return []
  const seed = hashSeed(`bank-${moduleId}`)
  const shuffled = seededShuffle(bank, seed)
  const selected = shuffled.slice(0, maxQuestions)

  return selected.map((entry, index) => {
    const correct = shortText(entry.answer)
    const explicitOptions = Array.isArray(entry.options) && entry.options.length >= 2
      ? unique(entry.options.map(shortText))
      : []
    const shuffledOptions = explicitOptions.length >= 2
      ? seededShuffle(explicitOptions, seed + index)
      : []
    const correctIndex = shuffledOptions.findIndex(option => option.toLowerCase() === correct.toLowerCase())
    const candidates = selected
      .filter((_e, i) => i !== index)
      .map(e => shortText(e.answer))
    const qType: QuestionType = entry.type ?? 'multiple_choice'
    const opts = correctIndex >= 0
      ? { options: shuffledOptions, correctIndex }
      : buildOptions(correct, candidates, seed + index)
    return {
      id: `bank-${index}`,
      type: qType,
      prompt: cleanText(entry.question),
      options: opts.options,
      correct_option_index: opts.correctIndex,
      explanation: entry.explanation || entry.feedback
        ? cleanText(entry.explanation ?? entry.feedback)
        : `La respuesta correcta es: ${correct}`
    }
  })
}

export function buildModuleQuiz(module: ModuleQuizSource): ModuleQuiz {
  // Fase 2: si el módulo tiene banco de preguntas, usarlo en lugar de la generación dinámica
  if (module.quiz_bank) {
    try {
      const bank: BankEntry[] = JSON.parse(module.quiz_bank)
      if (Array.isArray(bank) && bank.length > 0) {
        const questions = buildQuizFromBank(bank, module.id)
        return {
          scope: 'module',
          module_id: module.id,
          roadmap_id: module.roadmap_id,
          title: cleanText(module.title),
          questions
        }
      }
    } catch {
      // banco inválido: continuar con generación dinámica
    }
  }

  const title = cleanText(module.title)
  const contents = unique(asTextList(module.contents).map(shortText))
  const practicalActivities = unique(asTextList(module.practical_activity).map(shortText))
  const evidences = unique(asTextList(module.deliverable_evidence).map(shortText))
  const resources = unique(asLearningLinks(module.official_resources).map(link => shortText(link.label)))
  const questions: ModuleQuizQuestion[] = []

  if (contents[0]) {
    questions.push(buildQuestion(
      'module-content',
      `Que tema aparece en el contenido de ${title}?`,
      contents[0],
      [...contents.slice(1), ...practicalActivities, ...evidences],
      1,
      'La respuesta sale del bloque de contenidos del modulo.'
    ))
  }

  if (practicalActivities[0]) {
    questions.push(buildQuestion(
      'module-practice',
      `Que actividad practica corresponde a ${title}?`,
      practicalActivities[0],
      [...contents, ...evidences, ...resources],
      2,
      'La actividad correcta coincide con la practica propuesta del modulo.'
    ))
  }

  if (resources[0]) {
    questions.push(buildQuestion(
      'module-resource',
      `Que recurso oficial esta recomendado en ${title}?`,
      resources[0],
      [...contents, ...practicalActivities, ...evidences],
      3,
      'La respuesta procede de los recursos oficiales curados para el modulo.'
    ))
  }

  if (evidences[0]) {
    questions.push(buildQuestion(
      'module-evidence',
      `Que evidencia se espera entregar en ${title}?`,
      evidences[0],
      [...contents, ...practicalActivities, ...resources],
      4,
      'La respuesta coincide con una evidencia de entrega del modulo.'
    ))
  }

  // true_false: si hay un recurso con URL conocida, preguntar si es correcto
  if (questions.length < 5) {
    const resourceLinks = asLearningLinks(module.official_resources)
    const linkWithUrl = resourceLinks.find(link => link.url)
    if (linkWithUrl?.url) {
      questions.push(buildTrueFalseQuestion(
        'module-resource-tf',
        `El recurso "${shortText(linkWithUrl.label)}" es parte de los materiales recomendados para ${title}.`,
        true,
        `Efectivamente, "${shortText(linkWithUrl.label)}" es uno de los recursos oficiales curados para este modulo.`
      ))
    }
  }

  if (questions.length === 0 && module.evaluation) {
    questions.push(buildQuestion(
      'module-evaluation',
      `Que enunciado resume la evaluacion de ${title}?`,
      module.evaluation,
      [...contents, ...practicalActivities, ...evidences],
      5,
      'La respuesta se toma del criterio de evaluacion del modulo.'
    ))
  }

  return {
    scope: 'module',
    module_id: module.id,
    roadmap_id: module.roadmap_id,
    title,
    questions: questions.slice(0, 5)
  }
}

export function toPublicModuleQuiz(quiz: ModuleQuiz): PublicModuleQuiz {
  return {
    ...quiz,
    questions: quiz.questions.map(({ correct_option_index: _correctOptionIndex, ...question }) => question)
  }
}

function percentage(score: number, maxScore: number) {
  if (maxScore <= 0) return 0
  return Math.round((score / maxScore) * 100)
}

export function gradeModuleQuiz(
  module: ModuleQuizSource,
  answers: Record<string, unknown>,
  passingPercentage?: number
): QuizGrade {
  const quiz = buildModuleQuiz(module)
  const effectivePassing = passingPercentage ?? module.quiz_pass_percentage ?? PASSING_PERCENTAGE
  let score = 0
  const feedback = quiz.questions.map(question => {
    const rawAnswer = answers[question.id]
    const parsedAnswer = rawAnswer === null || rawAnswer === undefined ? null : Number(rawAnswer)
    const selectedOptionIndex = Number.isInteger(parsedAnswer) ? parsedAnswer : null
    const selectedOption = selectedOptionIndex === null ? null : question.options[selectedOptionIndex] || null
    const isCorrect = selectedOptionIndex === question.correct_option_index
    if (isCorrect) score += 1

    return {
      question_id: question.id,
      prompt: question.prompt,
      selected_option_index: selectedOptionIndex,
      selected_option: selectedOption,
      correct_option_index: question.correct_option_index,
      correct_option: question.options[question.correct_option_index],
      is_correct: isCorrect,
      explanation: question.explanation
    }
  })
  const maxScore = quiz.questions.length
  const scorePercentage = percentage(score, maxScore)

  return {
    score,
    max_score: maxScore,
    percentage: scorePercentage,
    passed: scorePercentage >= effectivePassing,
    feedback
  }
}

export async function saveModuleQuizAttempt(
  db: DbHandle,
  userId: number,
  module: ModuleQuizSource,
  answers: Record<string, unknown>
) {
  const grade = gradeModuleQuiz(module, answers)
  const submittedAt = new Date().toISOString()

  await db.run(
    `INSERT INTO user_quiz_attempts (
      user_id, roadmap_id, module_id, quiz_scope, score, max_score, answers,
      submitted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      module.roadmap_id || null,
      module.id,
      'module',
      grade.score,
      grade.max_score,
      JSON.stringify({ answers, feedback: grade.feedback }),
      submittedAt,
      submittedAt,
      submittedAt
    ]
  )

  return {
    ...grade,
    submitted_at: submittedAt
  }
}

export async function getModuleQuizSummary(
  db: DbHandle,
  userId: number,
  moduleId: number
): Promise<ModuleQuizSummary> {
  const aggregate = await db.get(
    `SELECT
        COUNT(*) AS attempts_count,
        AVG((score * 100.0) / max_score) AS average_score_percentage,
        MAX((score * 100.0) / max_score) AS best_score_percentage
     FROM user_quiz_attempts
     WHERE user_id = ?
       AND module_id = ?
       AND max_score > 0`,
    [userId, moduleId]
  )
  const latest = await db.get(
    `SELECT score, max_score, submitted_at
     FROM user_quiz_attempts
     WHERE user_id = ?
       AND module_id = ?
       AND max_score > 0
     ORDER BY datetime(submitted_at) DESC, id DESC
     LIMIT 1`,
    [userId, moduleId]
  )

  return {
    attempts_count: Number(aggregate?.attempts_count || 0),
    average_score_percentage: aggregate?.average_score_percentage === null || aggregate?.average_score_percentage === undefined
      ? null
      : Math.round(Number(aggregate.average_score_percentage)),
    best_score_percentage: aggregate?.best_score_percentage === null || aggregate?.best_score_percentage === undefined
      ? null
      : Math.round(Number(aggregate.best_score_percentage)),
    latest_attempt: latest
      ? {
        score: Number(latest.score || 0),
        max_score: Number(latest.max_score || 0),
        percentage: percentage(Number(latest.score || 0), Number(latest.max_score || 0)),
        submitted_at: latest.submitted_at
      }
      : null
  }
}

// ─── Fase 3: elegibilidad de intentos ─────────────────────────────────────────

/**
 * Comprueba si un usuario puede realizar un nuevo intento de quiz en un módulo.
 * Considera el límite de intentos y el cooldown entre reintentos fallidos.
 */
export async function checkAttemptEligibility(
  db: DbHandle,
  userId: number,
  module: ModuleQuizSource
): Promise<AttemptEligibility> {
  const passPct = module.quiz_pass_percentage ?? PASSING_PERCENTAGE
  const maxAttempts = module.quiz_max_attempts ?? null
  const cooldownMinutes = module.quiz_cooldown_minutes ?? null

  const attemptsCount = await db.get(
    `SELECT COUNT(*) AS cnt FROM user_quiz_attempts
     WHERE user_id = ? AND module_id = ? AND max_score > 0`,
    [userId, module.id]
  )
  const count = Number(attemptsCount?.cnt || 0)

  // Comprobar límite de intentos
  if (maxAttempts !== null && count >= maxAttempts) {
    return {
      allowed: false,
      remaining_attempts: 0,
      cooldown_ends_at: null,
      pass_percentage: passPct
    }
  }

  // Comprobar cooldown sobre el último intento fallido
  if (cooldownMinutes !== null) {
    const lastFailed = await db.get(
      `SELECT submitted_at, score, max_score FROM user_quiz_attempts
       WHERE user_id = ? AND module_id = ? AND max_score > 0
         AND (score * 100.0 / max_score) < ?
       ORDER BY datetime(submitted_at) DESC, id DESC
       LIMIT 1`,
      [userId, module.id, passPct]
    )
    if (lastFailed?.submitted_at) {
      const cooldownEnds = new Date(lastFailed.submitted_at)
      cooldownEnds.setMinutes(cooldownEnds.getMinutes() + cooldownMinutes)
      if (new Date() < cooldownEnds) {
        return {
          allowed: false,
          remaining_attempts: maxAttempts !== null ? maxAttempts - count : null,
          cooldown_ends_at: cooldownEnds.toISOString(),
          pass_percentage: passPct
        }
      }
    }
  }

  return {
    allowed: true,
    remaining_attempts: maxAttempts !== null ? maxAttempts - count : null,
    cooldown_ends_at: null,
    pass_percentage: passPct
  }
}
