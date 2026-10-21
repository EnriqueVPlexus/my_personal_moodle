import { z } from 'zod'
import { EVIDENCE_REVIEW_STATUSES, EVIDENCE_TYPES } from '../domains/progress/evidences'
import { attemptEligibilitySchema, timestampSchema } from './common'
import { categoryRefSchema, lessonRecordSchema, moduleRecordSchema, roadmapRecordSchema, topicRefSchema } from './content'

const optionalText = z.string().nullable().optional()

export const roadmapProgressStatusSchema = z.enum(['started', 'in_progress', 'paused', 'completed'])
export const moduleProgressStatusSchema = z.enum(['not_started', 'in_progress', 'completed'])

/** One entry of `GET /api/progress/roadmaps`. */
export const userRoadmapProgressSchema = z.object({
  roadmap_id: z.number().int(),
  title: z.string(),
  description: optionalText,
  duration: optionalText,
  started_at: optionalText,
  last_activity_at: z.string(),
  completed_at: optionalText,
  completed_lessons_count: z.number(),
  total_lessons: z.number(),
  total_modules: z.number(),
  time_spent_seconds: z.number(),
  current_module_id: z.number().nullable().optional(),
  current_module_title: optionalText,
  current_lesson_id: z.number().nullable().optional(),
  current_lesson_title: optionalText,
  progress_percentage: z.number(),
  status: roadmapProgressStatusSchema,
  next_href: z.string(),
  next_step_label: z.string(),
  quiz_attempts_count: z.number(),
  average_quiz_percentage: z.number().nullable().optional(),
  best_quiz_percentage: z.number().nullable().optional(),
  last_quiz_percentage: z.number().nullable().optional()
})

const roadmapModuleProgressSchema = z.object({
  module_id: z.number().int(),
  title: z.string(),
  position: z.number().nullable().optional(),
  total_lessons: z.number(),
  completed_lessons_count: z.number(),
  progress_percentage: z.number(),
  status: moduleProgressStatusSchema,
  last_activity_at: optionalText,
  next_lesson_id: z.number().nullable().optional(),
  next_lesson_title: optionalText
})

export const roadmapDetailProgressSchema = z.object({
  roadmap_id: z.number().int(),
  started_at: optionalText,
  last_activity_at: optionalText,
  completed_at: optionalText,
  completed_lessons_count: z.number(),
  total_lessons: z.number(),
  total_modules: z.number(),
  time_spent_seconds: z.number(),
  current_module_id: z.number().nullable().optional(),
  current_module_title: optionalText,
  current_lesson_id: z.number().nullable().optional(),
  current_lesson_title: optionalText,
  progress_percentage: z.number(),
  status: roadmapProgressStatusSchema,
  next_href: z.string(),
  next_step_label: z.string(),
  modules: z.array(roadmapModuleProgressSchema)
})

/** Module row of a roadmap detail; `has_evidence` and `progress` only carry data for signed-in learners. */
export const roadmapDetailModuleSchema = moduleRecordSchema.extend({
  has_evidence: z.boolean().optional().meta({ description: 'Solo con sesión iniciada. Siempre booleano, con SQLite y con PostgreSQL.' }),
  progress: roadmapModuleProgressSchema.nullable().optional()
})

/** `GET /api/roadmaps/{id}`. */
export const roadmapDetailResponseSchema = roadmapRecordSchema.extend({
  category: categoryRefSchema.nullable(),
  topics: z.array(topicRefSchema),
  modules: z.array(roadmapDetailModuleSchema),
  progress: roadmapDetailProgressSchema.nullable()
})

// --- Quizzes ---------------------------------------------------------------

export const quizQuestionSchema = z.object({
  id: z.string(),
  type: z.enum(['multiple_choice', 'true_false', 'code_snippet']),
  prompt: z.string(),
  options: z.array(z.string()),
  explanation: z.string()
}).meta({ description: 'Pregunta pública: nunca incluye `correct_option_index`.' })

export const moduleQuizSchema = z.object({
  scope: z.literal('module'),
  module_id: z.number().int(),
  roadmap_id: z.number().nullable().optional(),
  title: z.string(),
  questions: z.array(quizQuestionSchema)
})

export const quizSummarySchema = z.object({
  attempts_count: z.number(),
  average_score_percentage: z.number().nullable().optional(),
  best_score_percentage: z.number().nullable().optional(),
  latest_attempt: z.object({
    score: z.number(),
    max_score: z.number(),
    percentage: z.number(),
    submitted_at: z.string()
  }).nullable().optional()
})

export const quizFeedbackItemSchema = z.object({
  question_id: z.string(),
  prompt: z.string(),
  selected_option_index: z.number().nullable(),
  selected_option: optionalText,
  correct_option_index: z.number(),
  correct_option: z.string(),
  is_correct: z.boolean(),
  explanation: z.string()
})

/**
 * `GET /api/quizzes/modules/{id}`; `summary`, `eligibility` and `attempt_id` are `null` for anonymous readers.
 * A learner gets a quiz bound to an attempt session (random selection and option order).
 */
export const moduleQuizResponseSchema = z.object({
  attempt_id: z.string().nullable().meta({ description: 'Intento al que pertenece el cuestionario; envíalo en `POST`. `null` para lectores anónimos (vista previa) o si el módulo no tiene preguntas.' }),
  quiz: moduleQuizSchema,
  summary: quizSummarySchema.nullable(),
  eligibility: attemptEligibilitySchema.nullable()
})

/** `POST /api/quizzes/modules/{id}` (201): graded attempt plus refreshed summary and eligibility. */
export const quizAttemptResponseSchema = z.object({
  score: z.number(),
  max_score: z.number(),
  percentage: z.number(),
  passed: z.boolean(),
  feedback: z.array(quizFeedbackItemSchema),
  submitted_at: z.string(),
  attempt_id: z.string().nullable().meta({ description: 'Intento corregido; `null` si se corrigió sin `attempt_id` (clientes antiguos).' }),
  summary: quizSummarySchema,
  eligibility: attemptEligibilitySchema
})

// --- Module detail ---------------------------------------------------------

export const moduleLessonSchema = lessonRecordSchema.extend({
  progress_started_at: optionalText,
  progress_last_activity_at: optionalText,
  progress_completed_at: optionalText,
  progress_time_spent_seconds: z.number().optional()
}).meta({ description: 'Los campos `progress_*` solo aparecen con sesión iniciada.' })

export const moduleProgressSchema = z.object({
  total_lessons: z.number(),
  completed_lessons_count: z.number(),
  progress_percentage: z.number(),
  status: moduleProgressStatusSchema,
  next_lesson_id: z.number().nullable(),
  next_lesson_title: z.string().nullable(),
  time_spent_seconds: z.number()
})

/** `GET /api/modules/{id}`. */
export const moduleDetailResponseSchema = moduleRecordSchema.extend({
  lessons: z.array(moduleLessonSchema),
  progress: moduleProgressSchema.nullable(),
  quiz: moduleQuizSchema.meta({ description: 'Vista previa determinista del cuestionario. Para responder usa `GET /api/quizzes/modules/{id}`, que devuelve el intento con su `attempt_id`.' }),
  quiz_summary: quizSummarySchema.nullable()
})

/** `PUT /api/progress/lessons/{id}`. */
export const lessonProgressResponseSchema = z.object({
  lesson_id: z.number().int(),
  module_id: z.number().int(),
  roadmap_id: z.number().int(),
  title: z.string(),
  started_at: z.string().nullable(),
  last_activity_at: z.string(),
  completed_at: z.string().nullable(),
  completed: z.number(),
  time_spent_seconds: z.number(),
  roadmap_completed_lessons_count: z.number(),
  roadmap_time_spent_seconds: z.number()
})

// --- Evidences -------------------------------------------------------------

export const evidenceTypeSchema = z.enum(EVIDENCE_TYPES)
export const evidenceReviewStatusSchema = z.enum(EVIDENCE_REVIEW_STATUSES)

export const moduleEvidenceSchema = z.object({
  id: z.number().int(),
  user_id: z.number().int(),
  module_id: z.number().int(),
  evidence_type: evidenceTypeSchema,
  url: optionalText,
  note: optionalText,
  review_status: evidenceReviewStatusSchema,
  admin_comment: optionalText,
  reviewed_at: optionalText,
  reviewed_by_user_id: z.number().nullable().optional(),
  created_at: timestampSchema,
  updated_at: timestampSchema
})

/** `GET` and `PUT /api/evidences/modules/{id}`. */
export const moduleEvidenceResponseSchema = z.object({
  evidence: moduleEvidenceSchema.nullable().meta({ description: '`null` si el alumno aún no ha entregado evidencia (solo en GET).' })
})

/** Row of `GET /api/evidences`: the evidence plus who sent it and where. */
export const evidenceListItemSchema = moduleEvidenceSchema.extend({
  user_email: z.string(),
  user_name: z.string().nullable(),
  module_title: z.string(),
  module_position: z.number().nullable(),
  roadmap_id: z.number().int(),
  roadmap_title: z.string()
})

// --- Portfolio -------------------------------------------------------------

export const portfolioItemSchema = z.object({
  id: z.number().int(),
  module_id: z.number().int(),
  module_title: z.string(),
  module_position: z.number(),
  roadmap_id: z.number().int(),
  roadmap_title: z.string(),
  evidence_type: evidenceTypeSchema,
  url: optionalText,
  note: optionalText,
  review_status: evidenceReviewStatusSchema,
  admin_comment: optionalText,
  reviewed_at: optionalText,
  updated_at: z.string()
})

export const portfolioResponseSchema = z.object({
  user: z.object({ id: z.number().int(), name: z.string().nullable().optional(), email: z.string() }),
  total_evidences: z.number(),
  approved_evidences: z.number(),
  roadmaps: z.array(z.object({
    id: z.number().int(),
    title: z.string(),
    items: z.array(portfolioItemSchema)
  }))
})

export type UserRoadmapProgress = z.infer<typeof userRoadmapProgressSchema>
export type RoadmapDetailProgress = z.infer<typeof roadmapDetailProgressSchema>
export type RoadmapDetailModule = z.infer<typeof roadmapDetailModuleSchema>
export type RoadmapDetailResponse = z.infer<typeof roadmapDetailResponseSchema>
export type ModuleQuiz = z.infer<typeof moduleQuizSchema>
export type QuizQuestion = z.infer<typeof quizQuestionSchema>
export type QuizSummary = z.infer<typeof quizSummarySchema>
export type QuizFeedbackItem = z.infer<typeof quizFeedbackItemSchema>
export type ModuleQuizResponse = z.infer<typeof moduleQuizResponseSchema>
export type QuizAttemptResponse = z.infer<typeof quizAttemptResponseSchema>
export type ModuleLesson = z.infer<typeof moduleLessonSchema>
export type ModuleProgress = z.infer<typeof moduleProgressSchema>
export type ModuleDetailResponse = z.infer<typeof moduleDetailResponseSchema>
export type LessonProgressResponse = z.infer<typeof lessonProgressResponseSchema>
export type ModuleEvidence = z.infer<typeof moduleEvidenceSchema>
export type ModuleEvidenceResponse = z.infer<typeof moduleEvidenceResponseSchema>
export type EvidenceListItem = z.infer<typeof evidenceListItemSchema>
export type PortfolioResponse = z.infer<typeof portfolioResponseSchema>
