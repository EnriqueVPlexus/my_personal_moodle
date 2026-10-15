import { z } from 'zod'
import { timestampSchema } from './common'

const nullableText = z.string().nullable()
const nullableWeeks = z.number().nullable()

/** Stored text columns that hold JSON (contents, resources...) are returned as the raw text. */
export const roadmapRecordSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  description: nullableText,
  duration: nullableText,
  objectives: nullableText,
  methodology: nullableText,
  evaluation_weights: nullableText,
  category_id: z.number().int().nullable(),
  duration_weeks_min: nullableWeeks,
  duration_weeks_max: nullableWeeks,
  version: z.string(),
  published_at: timestampSchema
})

export const categoryRefSchema = z.object({ key: z.string(), label: z.string() })
export const topicRefSchema = z.object({ key: z.string(), label: z.string() })

/** One entry of `GET /api/roadmaps`: the roadmap row plus category, topics and module count. */
export const catalogRoadmapSchema = roadmapRecordSchema.extend({
  module_count: z.number(),
  category: categoryRefSchema.nullable(),
  topics: z.array(topicRefSchema),
  user_progress_status: z.enum(['not_started', 'in_progress', 'completed']).optional().meta({
    description: 'Solo aparece cuando hay una sesión iniciada.'
  })
})

export const moduleRecordSchema = z.object({
  id: z.number().int(),
  roadmap_id: z.number().int(),
  position: z.number().nullable(),
  title: z.string(),
  duration: nullableText,
  duration_weeks_min: nullableWeeks,
  duration_weeks_max: nullableWeeks,
  level: nullableText,
  objective: nullableText,
  contents: nullableText,
  importance: nullableText,
  official_resources: nullableText,
  support_videos: nullableText,
  practical_activity: nullableText,
  deliverable_evidence: nullableText,
  evaluation: nullableText,
  quiz_bank: nullableText,
  quiz_pass_percentage: z.number().nullable(),
  quiz_max_attempts: z.number().nullable(),
  quiz_cooldown_minutes: z.number().nullable()
})

export const lessonRecordSchema = z.object({
  id: z.number().int(),
  module_id: z.number().int(),
  title: z.string(),
  completed: z.number()
})

const countedItemSchema = z.object({ key: z.string(), label: z.string(), roadmap_count: z.number() })

export const catalogMetadataSchema = z.object({
  categories: z.array(countedItemSchema),
  topics: z.array(countedItemSchema),
  levels: z.array(z.object({ key: z.string(), roadmap_count: z.number() })),
  duration: z.object({ min_weeks: nullableWeeks, max_weeks: nullableWeeks }),
  duration_ranges: z.array(countedItemSchema),
  progress_statuses: z.array(countedItemSchema),
  unclassified_roadmaps: z.number()
})

// --- Import / export -------------------------------------------------------

const importLinkSchema = z.object({ label: z.string(), url: z.string().optional() })

const importQuizQuestionSchema = z.object({
  question: z.string(),
  answer: z.string(),
  options: z.array(z.string()),
  explanation: nullableText,
  type: z.enum(['multiple_choice', 'true_false', 'code_snippet'])
})

/** Normalized roadmap document: the shape `GET /api/roadmaps/{id}/export` writes and the import expects back. */
export const roadmapDocumentSchema = z.object({
  title: z.string(),
  description: nullableText,
  duration: nullableText,
  duration_weeks_min: nullableWeeks,
  duration_weeks_max: nullableWeeks,
  category: nullableText,
  topics: z.array(z.string()),
  objectives: z.array(z.string()),
  methodology: z.array(z.string()),
  evaluation_weights: z.record(z.string(), z.string()),
  version: z.string(),
  published_at: z.string(),
  modules: z.array(z.object({
    position: z.number(),
    title: z.string(),
    level: z.enum(['beginner', 'intermediate', 'advanced', 'capstone']).nullable(),
    duration: nullableText,
    duration_weeks_min: nullableWeeks,
    duration_weeks_max: nullableWeeks,
    objective: nullableText,
    contents: z.array(z.string()),
    importance: nullableText,
    official_resources: z.array(importLinkSchema),
    support_videos: z.array(importLinkSchema),
    practical_activity: z.array(z.string()),
    deliverable_evidence: z.array(z.string()),
    evaluation: nullableText,
    quiz: z.array(importQuizQuestionSchema)
  }))
})

export const importPreviewResponseSchema = z.object({
  roadmap: roadmapDocumentSchema,
  existing: z.object({ id: z.number().int(), title: z.string() }).nullable().meta({
    description: 'Roadmap existente con el mismo título que se tocaría al publicar; `null` si no hay.'
  })
})

export const importResultResponseSchema = z.object({
  roadmap_id: z.number().int(),
  created_modules: z.number().int(),
  updated_modules: z.number().int()
})

export type RoadmapRecord = z.infer<typeof roadmapRecordSchema>
export type CatalogRoadmap = z.infer<typeof catalogRoadmapSchema>
export type ModuleRecordContract = z.infer<typeof moduleRecordSchema>
export type LessonRecordContract = z.infer<typeof lessonRecordSchema>
export type CatalogMetadata = z.infer<typeof catalogMetadataSchema>
export type RoadmapDocument = z.infer<typeof roadmapDocumentSchema>
export type ImportPreviewResponse = z.infer<typeof importPreviewResponseSchema>
export type ImportResultResponse = z.infer<typeof importResultResponseSchema>
