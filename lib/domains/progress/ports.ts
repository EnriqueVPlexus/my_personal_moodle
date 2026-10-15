import type { AttemptEligibility, ModuleQuizSource, ModuleQuizSummary, QuizGrade } from '../content/quizzes'
import type { ModuleRecord, RoadmapWithCategory, TopicRecord } from '../content/types'
import type { EvidenceReviewStatus, EvidenceType, ModuleEvidence } from './evidences'
import type { PortfolioItem, UserPortfolio } from './portfolio'
import type {
  LessonProgressUpdate,
  RoadmapDetailProgress,
  RoadmapProgressTouch,
  UserRoadmapProgressSummary
} from './types'

/** Rows pass through to the API untouched, so they stay loosely typed. */
export type LearnerRow = Record<string, any>

export type LessonProgressResult = {
  lesson_id: number
  module_id: number
  roadmap_id: number
  title: string
  started_at: string | null
  last_activity_at: string
  completed_at: string | null
  completed: number
  time_spent_seconds: number
  roadmap_completed_lessons_count: number
  roadmap_time_spent_seconds: number
}

export interface ProgressRepository {
  touchRoadmapProgress(options: RoadmapProgressTouch): Promise<unknown>
  setLessonProgress(options: LessonProgressUpdate): Promise<LessonProgressResult | null>
  listUserRoadmapProgress(userId: number): Promise<UserRoadmapProgressSummary[]>
  getRoadmapDetailProgress(userId: number, roadmapId: number): Promise<RoadmapDetailProgress>
}

/** Read models joining catalog rows with the learner's own data. */
export interface LearnerViewRepository {
  listRoadmapModules(roadmapId: number, userId: number | null): Promise<LearnerRow[]>
  listModuleLessons(moduleId: number, userId: number | null): Promise<LearnerRow[]>
}

export interface QuizAttemptRepository {
  save(
    userId: number,
    module: ModuleQuizSource,
    answers: Record<string, unknown>,
    grade: QuizGrade
  ): Promise<QuizGrade & { submitted_at: string }>
  getSummary(userId: number, moduleId: number): Promise<ModuleQuizSummary>
  checkEligibility(userId: number, module: ModuleQuizSource): Promise<AttemptEligibility>
}

export type EvidenceListFilter = {
  userId?: number | null
  moduleId?: number | null
  roadmapId?: number | null
  status?: EvidenceReviewStatus | null
}

export interface EvidenceRepository {
  get(userId: number, moduleId: number): Promise<ModuleEvidence | null>
  getById(evidenceId: number): Promise<ModuleEvidence | null>
  save(
    userId: number,
    moduleId: number,
    input: { evidenceType: EvidenceType; url: string | null; note: string | null }
  ): Promise<ModuleEvidence>
  review(
    evidenceId: number,
    adminUserId: number,
    input: { reviewStatus: EvidenceReviewStatus; adminComment?: string | null }
  ): Promise<ModuleEvidence | null>
  delete(userId: number, moduleId: number): Promise<number>
  list(filters: EvidenceListFilter): Promise<LearnerRow[]>
}

export interface PortfolioRepository {
  getForUser(userId: number): Promise<UserPortfolio | null>
}

/** Catalog data the learner views need; implemented with the content repositories. */
export interface ContentReader {
  findRoadmap(id: number): Promise<RoadmapWithCategory | undefined>
  findModule(id: number): Promise<ModuleRecord | undefined>
  getRoadmapTopics(roadmapId: number): Promise<TopicRecord[]>
}

export type { PortfolioItem }
