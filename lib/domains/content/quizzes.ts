import { asLearningLinks, asTextList } from './presentation'

export type ModuleQuizSource = {
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

/** How many questions one attempt shows, drawn from the module's bank. */
export const QUIZ_QUESTIONS_PER_ATTEMPT = 5

/** Source of randomness in [0, 1). Injectable so tests are deterministic. */
export type RandomSource = () => number

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

/** Shuffles `items` for the question at `position` of the selection. */
type OptionShuffler = <T>(items: T[], position: number) => T[]

/**
 * Builds the questions for the bank entries at `selection` (indexes into the
 * stored bank). Ids are `bank-<index in the stored bank>`, so they do not depend
 * on the order the selection was drawn in.
 */
function buildBankQuestions(
  bank: BankEntry[],
  selection: number[],
  shuffleOptions: OptionShuffler,
  seedFor: (position: number) => number
): ModuleQuizQuestion[] {
  const selected = selection.map(bankIndex => bank[bankIndex])

  return selected.map((entry, position) => {
    const correct = shortText(entry.answer)
    const explicitOptions = Array.isArray(entry.options) && entry.options.length >= 2
      ? unique(entry.options.map(shortText))
      : []
    const shuffledOptions = explicitOptions.length >= 2
      ? shuffleOptions(explicitOptions, position)
      : []
    const correctIndex = shuffledOptions.findIndex(option => option.toLowerCase() === correct.toLowerCase())
    const candidates = selected
      .filter((_e, i) => i !== position)
      .map(e => shortText(e.answer))
    const qType: QuestionType = entry.type ?? 'multiple_choice'
    const opts = correctIndex >= 0
      ? { options: shuffledOptions, correctIndex }
      : buildOptions(correct, candidates, seedFor(position))
    return {
      id: `bank-${selection[position]}`,
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

/**
 * Deterministic selection and shuffle seeded by `module_id`. Used for the
 * anonymous preview, the module-detail embed and the legacy submit path, so
 * all of them show the same quiz on every call.
 */
export function buildQuizFromBank(
  bank: BankEntry[],
  moduleId: number,
  maxQuestions = QUIZ_QUESTIONS_PER_ATTEMPT
): ModuleQuizQuestion[] {
  if (!bank.length) return []
  const seed = hashSeed(`bank-${moduleId}`)
  const selection = seededShuffle(bank.map((_entry, index) => index), seed).slice(0, maxQuestions)

  return buildBankQuestions(
    bank,
    selection,
    (items, position) => seededShuffle(items, seed + position),
    position => seed + position
  )
}

/** Fisher-Yates shuffle driven by an injectable random source. */
function randomShuffle<T>(arr: T[], random: RandomSource): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Per-attempt build: a random subset of up to `maxQuestions` bank entries,
 * each with its options shuffled. Pure given `random`.
 */
export function buildRandomQuizFromBank(
  bank: BankEntry[],
  random: RandomSource,
  maxQuestions = QUIZ_QUESTIONS_PER_ATTEMPT
): ModuleQuizQuestion[] {
  if (!bank.length) return []
  const selection = randomShuffle(bank.map((_entry, index) => index), random).slice(0, maxQuestions)

  return buildBankQuestions(
    bank,
    selection,
    items => randomShuffle(items, random),
    () => Math.floor(random() * 0x7fffffff)
  )
}

function parseQuizBank(module: ModuleQuizSource): BankEntry[] | null {
  if (!module.quiz_bank) return null
  try {
    const bank: BankEntry[] = JSON.parse(module.quiz_bank)
    return Array.isArray(bank) && bank.length > 0 ? bank : null
  } catch {
    // banco inválido: continuar con generación dinámica
    return null
  }
}

function quizShell(module: ModuleQuizSource, questions: ModuleQuizQuestion[]): ModuleQuiz {
  return {
    scope: 'module',
    module_id: module.id,
    roadmap_id: module.roadmap_id,
    title: cleanText(module.title),
    questions
  }
}

/** Wraps a stored snapshot of questions into the module's quiz shape. */
export function quizFromQuestions(module: ModuleQuizSource, questions: ModuleQuizQuestion[]): ModuleQuiz {
  return quizShell(module, questions)
}

/**
 * Quiz for one attempt: random selection and option order when the module has
 * a bank. Modules without a bank use the generated (deterministic) quiz.
 */
export function buildAttemptQuiz(module: ModuleQuizSource, random: RandomSource = Math.random): ModuleQuiz {
  const bank = parseQuizBank(module)
  if (bank) return quizShell(module, buildRandomQuizFromBank(bank, random))
  return buildModuleQuiz(module)
}

export function buildModuleQuiz(module: ModuleQuizSource): ModuleQuiz {
  // Fase 2: si el módulo tiene banco de preguntas, usarlo en lugar de la generación dinámica
  const bank = parseQuizBank(module)
  if (bank) return quizShell(module, buildQuizFromBank(bank, module.id))

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
    questions: questions.slice(0, QUIZ_QUESTIONS_PER_ATTEMPT)
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

/** Grades `answers` against an explicit list of questions (e.g. a stored session snapshot). */
export function gradeQuizQuestions(
  questions: ModuleQuizQuestion[],
  answers: Record<string, unknown>,
  passingPercentage?: number | null
): QuizGrade {
  const effectivePassing = passingPercentage ?? PASSING_PERCENTAGE
  let score = 0
  const feedback = questions.map(question => {
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
  const maxScore = questions.length
  const scorePercentage = percentage(score, maxScore)

  return {
    score,
    max_score: maxScore,
    percentage: scorePercentage,
    passed: scorePercentage >= effectivePassing,
    feedback
  }
}

export function gradeModuleQuiz(
  module: ModuleQuizSource,
  answers: Record<string, unknown>,
  passingPercentage?: number
): QuizGrade {
  return gradeQuizQuestions(
    buildModuleQuiz(module).questions,
    answers,
    passingPercentage ?? module.quiz_pass_percentage
  )
}
