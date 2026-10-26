import { scopeAllowsRoadmap } from '../auth/policy'
import type { UnitOfWork } from '../shared/unitOfWork'
import { toPublicModule } from '../content/publicModule'
import {
  buildAttemptQuiz,
  buildModuleQuiz,
  gradeQuizQuestions,
  quizFromQuestions,
  toPublicModuleQuiz,
  type ModuleQuizQuestion,
  type RandomSource
} from '../content/quizzes'
import type { ContentReadScope } from '../content/types'
import type { EvidenceReviewStatus, EvidenceType } from './evidences'
import { buildModuleProgress } from './moduleProgress'
import { exportPortfolioAsMarkdown } from './portfolio'
import { buildQuizResultsExport, quizResultsFilename, quizResultsToCsv } from './quizExport'
import type {
  ContentReader,
  EvidenceListFilter,
  EvidenceRepository,
  LearnerViewRepository,
  PortfolioRepository,
  ProgressRepository,
  QuizAttemptRepository,
  QuizAttemptSession,
  QuizSessionRepository
} from './ports'

export type ProgressPorts = {
  progress: ProgressRepository
  learnerViews: LearnerViewRepository
  quizAttempts: QuizAttemptRepository
  quizSessions: QuizSessionRepository
  evidences: EvidenceRepository
  portfolios: PortfolioRepository
  content: ContentReader
  /** Atomic learner writes that touch several tables. */
  unitOfWork: UnitOfWork<{
    progress: ProgressRepository
    quizAttempts: QuizAttemptRepository
    quizSessions: QuizSessionRepository
    evidences: EvidenceRepository
  }>
  /** Test seams; production uses the defaults. */
  clock?: () => Date
  newId?: () => string
  random?: RandomSource
}

/** How long a served quiz can still be submitted. */
export const QUIZ_SESSION_TTL_MS = 24 * 60 * 60 * 1000

/** Loads the caller's read scope on demand (it may be unavailable). */
export type ScopeLoader = () => Promise<ContentReadScope | null>

export type EvidenceInput = { evidenceType: EvidenceType; url: string | null; note: string | null }

export type QuizAttemptOutcome =
  | { status: 'not_found' }
  | { status: 'not_eligible'; eligibility: Awaited<ReturnType<QuizAttemptRepository['checkEligibility']>> }
  | { status: 'no_questions' }
  | { status: 'invalid_answers' }
  /** The `attempt_id` is unknown, foreign, for another module, already submitted or expired. */
  | { status: 'session_unavailable' }
  | {
      status: 'ok'
      attempt: Awaited<ReturnType<QuizAttemptRepository['save']>>
    /** Session the attempt was graded against; null on the legacy path. */
    attemptId: string | null
      summary: Awaited<ReturnType<QuizAttemptRepository['getSummary']>>
      eligibility: Awaited<ReturnType<QuizAttemptRepository['checkEligibility']>>
    }

export type ProgressService = ReturnType<typeof makeProgressService>

export function makeProgressService(ports: ProgressPorts) {
  const { progress, learnerViews, quizAttempts, quizSessions, evidences, portfolios, content, unitOfWork } = ports
  const clock = ports.clock ?? (() => new Date())
  const newId = ports.newId ?? (() => globalThis.crypto.randomUUID())
  const random = ports.random ?? Math.random

  return {
    // --- Learner progress -------------------------------------------------

    listRoadmapProgress(userId: number) {
      return progress.listUserRoadmapProgress(userId)
    },

    /** Returns null when the lesson does not exist. */
    setLessonProgress(input: { userId: number; lessonId: number; completed: boolean; timeSpentSeconds: number }) {
      return unitOfWork.run(({ progress: tx }) => tx.setLessonProgress(input))
    },

    /** Returns null when the roadmap is hidden from the scope or missing. */
    async getRoadmapDetail(scope: ContentReadScope, roadmapId: number) {
      if (!scopeAllowsRoadmap(scope, roadmapId)) return null
      const roadmap = await content.findRoadmap(roadmapId)
      if (!roadmap) return null
      const user = scope.user

      if (user) {
        await progress.touchRoadmapProgress({ userId: user.id, roadmapId: roadmap.id })
      }

      const roadmapProgress = user
        ? await progress.getRoadmapDetailProgress(user.id, roadmap.id)
        : null
      const modules = await learnerViews.listRoadmapModules(roadmapId, user ? user.id : null)
      const modulesWithProgress = roadmapProgress
        ? modules.map(module => ({
          ...module,
          progress: roadmapProgress.modules.find(item => item.module_id === module.id) || null
        }))
        : modules

      const topics = await content.getRoadmapTopics(roadmap.id)

      const { category_key: categoryKey, category_label: categoryLabel, ...publicRoadmap } = roadmap
      return {
        ...publicRoadmap,
        category: categoryKey && categoryLabel ? { key: categoryKey, label: categoryLabel } : null,
        topics,
        modules: modulesWithProgress,
        progress: roadmapProgress
      }
    },

    /** Returns null when the module is hidden from the scope or missing. */
    async getModuleDetail(scope: ContentReadScope, moduleId: number) {
      const moduleRow = await content.findModuleWithQuizBank(moduleId)
      if (!moduleRow) return null
      if (!scopeAllowsRoadmap(scope, moduleRow.roadmap_id)) return null
      const user = scope.user

      if (user) {
        await progress.touchRoadmapProgress({
          userId: user.id,
          roadmapId: moduleRow.roadmap_id,
          moduleId: moduleRow.id
        })
      }

      const lessons = await learnerViews.listModuleLessons(moduleId, user ? user.id : null)
      const quiz = buildModuleQuiz(moduleRow)
      const quizSummary = user ? await quizAttempts.getSummary(user.id, moduleRow.id) : null

      return {
        ...toPublicModule(moduleRow),
        lessons,
        progress: user ? buildModuleProgress(lessons, true) : null,
        quiz: toPublicModuleQuiz(quiz),
        quiz_summary: quizSummary
      }
    },

    // --- Quizzes ----------------------------------------------------------

    /**
     * `userId` is null for anonymous readers, who only see the deterministic
     * preview (`attempt_id: null`). A learner gets the quiz of their active
     * session (reloading does not re-roll the questions) or a new session with a
     * random selection. A session is created even when the learner is not
     * eligible: the submit still answers 429 first.
     */
    async getModuleQuiz(userId: number | null, moduleId: number) {
      const moduleRow = await content.findModuleWithQuizBank(moduleId)
      if (!moduleRow) return null

      if (userId === null) {
        return { attempt_id: null, quiz: toPublicModuleQuiz(buildModuleQuiz(moduleRow)), summary: null, eligibility: null }
      }

      const now = clock()
      let session = await quizSessions.findActive(userId, moduleId, now.toISOString())
      if (!session) {
        const fresh = buildAttemptQuiz(moduleRow, random)
        // Nothing to serve (no bank and nothing to generate): no session either.
        if (fresh.questions.length > 0) {
          session = await quizSessions.create({
            id: newId(),
            userId,
            moduleId,
            questions: fresh.questions,
            createdAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + QUIZ_SESSION_TTL_MS).toISOString()
          })
        }
      }

      const quiz = session ? quizFromQuestions(moduleRow, session.questions) : buildModuleQuiz(moduleRow)
      const summary = await quizAttempts.getSummary(userId, moduleId)
      const eligibility = await quizAttempts.checkEligibility(userId, moduleRow)

      return { attempt_id: session ? session.id : null, quiz: toPublicModuleQuiz(quiz), summary, eligibility }
    },

    /**
     * Grades against the session snapshot, never against the live bank.
     * With `attemptId` the session must belong to the user and module and be
     * open. Without it (legacy clients) the deterministic quiz is graded exactly
     * as before 3.4.0: no session is looked up, closed or recorded.
     */
    async submitQuizAttempt(
      userId: number,
      moduleId: number,
      answers: Record<string, unknown>,
      attemptId?: string
    ): Promise<QuizAttemptOutcome> {
      const moduleRow = await content.findModuleWithQuizBank(moduleId)
      if (!moduleRow) return { status: 'not_found' }

      const eligibility = await quizAttempts.checkEligibility(userId, moduleRow)
      if (!eligibility.allowed) return { status: 'not_eligible', eligibility }

      const now = clock()
      let session: QuizAttemptSession | null = null
      if (attemptId !== undefined) {
        session = await quizSessions.findById(attemptId)
        const usable = session !== null
          && session.user_id === userId
          && session.module_id === moduleId
          && session.submitted_at === null
          && new Date(session.expires_at) > now
        if (!usable) return { status: 'session_unavailable' }
      }

      const questions: ModuleQuizQuestion[] = session ? session.questions : buildModuleQuiz(moduleRow).questions
      if (questions.length === 0) return { status: 'no_questions' }

      const normalizedAnswers: Record<string, number> = {}
      const hasInvalidAnswer = questions.some(question => {
        const rawAnswer = answers[question.id]
        if (typeof rawAnswer !== 'number') return true
        if (!Number.isInteger(rawAnswer) || rawAnswer < 0 || rawAnswer >= question.options.length) return true
        normalizedAnswers[question.id] = rawAnswer
        return false
      })
      if (hasInvalidAnswer) return { status: 'invalid_answers' }

      const grade = gradeQuizQuestions(questions, normalizedAnswers, moduleRow.quiz_pass_percentage)
      const sessionId = session ? session.id : null
      // The session is closed, the attempt saved and the roadmap progress touched together.
      // The conditional close makes a concurrent double submit save only one attempt.
      const attempt = await unitOfWork.run(async ({ quizAttempts: txAttempts, quizSessions: txSessions, progress: txProgress }) => {
        if (sessionId && !(await txSessions.markSubmitted(sessionId, now.toISOString()))) return null
        const saved = await txAttempts.save(userId, moduleRow, normalizedAnswers, grade, sessionId)
        await txProgress.touchRoadmapProgress({
          userId,
          roadmapId: moduleRow.roadmap_id,
          moduleId: moduleRow.id
        })
        return saved
      })
      if (!attempt) return { status: 'session_unavailable' }

      const summary = await quizAttempts.getSummary(userId, moduleId)
      const updatedEligibility = await quizAttempts.checkEligibility(userId, moduleRow)

      return { status: 'ok', attempt, attemptId: sessionId, summary, eligibility: updatedEligibility }
    },

    // --- Evidences --------------------------------------------------------

    listEvidences(filters: EvidenceListFilter) {
      return evidences.list(filters)
    },

    /** Returns null when the module is missing or hidden from the scope. */
    async getModuleEvidence(scope: ContentReadScope, userId: number, moduleId: number) {
      const moduleRow = await content.findModule(moduleId)
      if (!moduleRow || !scopeAllowsRoadmap(scope, moduleRow.roadmap_id)) return null

      return { evidence: await evidences.get(userId, moduleId) }
    },

    /**
     * Saves the learner's evidence. The scope is loaded lazily, after the
     * module lookup, to keep the exact order of reads the endpoint always had.
     */
    async saveModuleEvidence(userId: number, moduleId: number, input: EvidenceInput, loadScope: ScopeLoader) {
      const moduleRow = await content.findModule(moduleId)
      if (!moduleRow) return null

      const scope = await loadScope()
      if (!scope || !scopeAllowsRoadmap(scope, moduleRow.roadmap_id)) return null

      const evidence = await unitOfWork.run(async ({ evidences: txEvidences, progress: txProgress }) => {
        const saved = await txEvidences.save(userId, moduleId, input)
        await txProgress.touchRoadmapProgress({
          userId,
          roadmapId: moduleRow.roadmap_id,
          moduleId
        })
        return saved
      })

      return { evidence }
    },

    /** Returns false when the module, the scope or the evidence is missing. */
    async deleteModuleEvidence(userId: number, moduleId: number, loadScope: ScopeLoader) {
      const moduleRow = await content.findModule(moduleId)
      if (!moduleRow) return false

      const scope = await loadScope()
      if (!scope || !scopeAllowsRoadmap(scope, moduleRow.roadmap_id)) return false

      const changes = await evidences.delete(userId, moduleId)
      return Boolean(changes)
    },

    /** Returns null when the evidence does not exist. */
    async reviewEvidence(
      evidenceId: number,
      adminUserId: number,
      input: { reviewStatus: EvidenceReviewStatus; adminComment?: string | null }
    ) {
      const previous = await evidences.getById(evidenceId)
      const updated = await evidences.review(evidenceId, adminUserId, input)
      if (!updated) return null

      return { previous, updated }
    },

    // --- Portfolio --------------------------------------------------------

    /** Returns null when the user no longer exists. */
    getPortfolio(userId: number) {
      return portfolios.getForUser(userId)
    },

    exportPortfolioMarkdown: exportPortfolioAsMarkdown,

    // --- Student self-export ----------------------------------------------

    /** The caller's own quiz attempts. Takes the authenticated user, never an id from the request. */
    async exportQuizResults(user: { id: number; email: string; name?: string | null }) {
      const attempts = await quizAttempts.listForUser(user.id)
      return buildQuizResultsExport(user, attempts, clock())
    },

    quizResultsToCsv,
    quizResultsFilename
  }
}
