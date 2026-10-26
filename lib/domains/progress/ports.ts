import type {
  AttemptEligibility,
  ModuleQuizQuestion,
  ModuleQuizSource,
  ModuleQuizSummary,
  QuizGrade
} from '../content/quizzes'
import type { ModuleRecord, ModuleWithQuizBank, RoadmapWithCategory, TopicRecord } from '../content/types'
import type { EvidenceReviewStatus, EvidenceType, ModuleEvidence } from './evidences'
import type { PortfolioItem, UserPortfolio } from './portfolio'
import type { QuizAttemptExportRow } from './quizExport'
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
    grade: QuizGrade,
    /** Session the attempt was graded against; null for the legacy (session-less) path. */
    attemptId?: string | null
  ): Promise<QuizGrade & { submitted_at: string }>
  getSummary(userId: number, moduleId: number): Promise<ModuleQuizSummary>
  checkEligibility(userId: number, module: ModuleQuizSource): Promise<AttemptEligibility>
  /** All attempts of that single user, oldest first, for the self-service export. */
  listForUser(userId: number): Promise<QuizAttemptExportRow[]>
}

/** What the server served for one attempt. `questions` keeps the answers: never send it to a client. */
export type QuizAttemptSession = {
  id: string
  user_id: number
  module_id: number
  questions: ModuleQuizQuestion[]
  created_at: string
  expires_at: string
  submitted_at: string | null
}

export type NewQuizAttemptSession = {
  id: string
  userId: number
  moduleId: number
  questions: ModuleQuizQuestion[]
  createdAt: string
  expiresAt: string
}

export interface QuizSessionRepository {
  /** Latest session of the user for the module that is neither submitted nor expired at `now`. */
  findActive(userId: number, moduleId: number, now: string): Promise<QuizAttemptSession | null>
  create(session: NewQuizAttemptSession): Promise<QuizAttemptSession>
  findById(id: string): Promise<QuizAttemptSession | null>
  /** Conditional update: resolves false when the session was already submitted (or does not exist). */
  markSubmitted(id: string, submittedAt: string): Promise<boolean>
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
  /** Internal: includes `quiz_bank`. Only for quiz building and grading. */
  findModuleWithQuizBank(id: number): Promise<ModuleWithQuizBank | undefined>
  getRoadmapTopics(roadmapId: number): Promise<TopicRecord[]>
}

export type { PortfolioItem }
