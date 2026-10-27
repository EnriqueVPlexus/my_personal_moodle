import { z } from 'zod'
import { adminUserSchema, adminUserWithAccessSchema, auditLogEntrySchema, dashboardResponseSchema } from './admin'
import { roadmapImportSchema } from '../domains/content/importSchema'
import { authUserSchema } from './auth'
import {
  attemptEligibilitySchema,
  errorBodySchema,
  importConflictBodySchema,
  quizNotEligibleBodySchema,
  validationIssueSchema
} from './common'
import {
  catalogMetadataSchema,
  catalogRoadmapSchema,
  categoryRefSchema,
  importPreviewResponseSchema,
  importResultResponseSchema,
  lessonRecordSchema,
  moduleRecordSchema,
  roadmapDocumentSchema,
  roadmapRecordSchema,
  topicRefSchema
} from './content'
import {
  evidenceListItemSchema,
  lessonProgressResponseSchema,
  moduleDetailResponseSchema,
  moduleEvidenceSchema,
  moduleLessonSchema,
  moduleProgressSchema,
  moduleQuizSchema,
  portfolioResponseSchema,
  quizResultsExportSchema,
  quizFeedbackItemSchema,
  quizQuestionSchema,
  quizSummarySchema,
  roadmapDetailModuleSchema,
  roadmapDetailProgressSchema,
  roadmapDetailResponseSchema,
  userRoadmapProgressSchema
} from './progress'

/**
 * Named models. The names become `components.schemas` in the OpenAPI document
 * (Zod extracts any schema registered with an `id` and the generator rewrites
 * the references). Adding a model here is optional: unnamed schemas are
 * inlined where they are used.
 */
export const namedModels = {
  ErrorBody: errorBodySchema,
  ValidationIssue: validationIssueSchema,
  ImportConflictBody: importConflictBodySchema,
  QuizNotEligibleBody: quizNotEligibleBodySchema,
  AttemptEligibility: attemptEligibilitySchema,
  AuthUser: authUserSchema,
  RoadmapRecord: roadmapRecordSchema,
  CategoryRef: categoryRefSchema,
  TopicRef: topicRefSchema,
  CatalogRoadmap: catalogRoadmapSchema,
  ModuleRecord: moduleRecordSchema,
  LessonRecord: lessonRecordSchema,
  CatalogMetadata: catalogMetadataSchema,
  RoadmapDocument: roadmapDocumentSchema,
  RoadmapImportDocument: roadmapImportSchema,
  ImportPreview: importPreviewResponseSchema,
  ImportResult: importResultResponseSchema,
  UserRoadmapProgress: userRoadmapProgressSchema,
  RoadmapDetailProgress: roadmapDetailProgressSchema,
  RoadmapDetailModule: roadmapDetailModuleSchema,
  RoadmapDetail: roadmapDetailResponseSchema,
  QuizQuestion: quizQuestionSchema,
  ModuleQuiz: moduleQuizSchema,
  QuizSummary: quizSummarySchema,
  QuizFeedbackItem: quizFeedbackItemSchema,
  ModuleLesson: moduleLessonSchema,
  ModuleProgress: moduleProgressSchema,
  ModuleDetail: moduleDetailResponseSchema,
  LessonProgress: lessonProgressResponseSchema,
  ModuleEvidence: moduleEvidenceSchema,
  EvidenceListItem: evidenceListItemSchema,
  Portfolio: portfolioResponseSchema,
  QuizResultsExport: quizResultsExportSchema,
  AdminUser: adminUserSchema,
  AdminUserWithAccess: adminUserWithAccessSchema,
  Dashboard: dashboardResponseSchema,
  AuditLogEntry: auditLogEntrySchema
} as const

for (const [id, schema] of Object.entries(namedModels)) {
  z.globalRegistry.add(schema, { ...z.globalRegistry.get(schema), id })
}
