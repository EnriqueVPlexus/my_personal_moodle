import { scopeAllowsRoadmap } from '../auth/policy'
import { buildModuleQuiz, gradeModuleQuiz, toPublicModuleQuiz } from '../content/quizzes'
import type { ContentReadScope } from '../content/types'
import type { EvidenceReviewStatus, EvidenceType } from './evidences'
import { buildModuleProgress } from './moduleProgress'
import { exportPortfolioAsMarkdown } from './portfolio'
import type {
  ContentReader,
  EvidenceListFilter,
  EvidenceRepository,
  LearnerViewRepository,
  PortfolioRepository,
  ProgressRepository,
  QuizAttemptRepository
} from './ports'

export type ProgressPorts = {
  progress: ProgressRepository
  learnerViews: LearnerViewRepository
  quizAttempts: QuizAttemptRepository
  evidences: EvidenceRepository
  portfolios: PortfolioRepository
  content: ContentReader
}

/** Loads the caller's read scope on demand (it may be unavailable). */
export type ScopeLoader = () => Promise<ContentReadScope | null>

export type EvidenceInput = { evidenceType: EvidenceType; url: string | null; note: string | null }

export type QuizAttemptOutcome =
  | { status: 'not_found' }
  | { status: 'not_eligible'; eligibility: Awaited<ReturnType<QuizAttemptRepository['checkEligibility']>> }
  | { status: 'no_questions' }
  | { status: 'invalid_answers' }
  | {
      status: 'ok'
      attempt: Awaited<ReturnType<QuizAttemptRepository['save']>>
      summary: Awaited<ReturnType<QuizAttemptRepository['getSummary']>>
      eligibility: Awaited<ReturnType<QuizAttemptRepository['checkEligibility']>>
    }

export type ProgressService = ReturnType<typeof makeProgressService>

export function makeProgressService(ports: ProgressPorts) {
  const { progress, learnerViews, quizAttempts, evidences, portfolios, content } = ports

  return {
    // --- Learner progress -------------------------------------------------

    listRoadmapProgress(userId: number) {
      return progress.listUserRoadmapProgress(userId)
    },

    /** Returns null when the lesson does not exist. */
    setLessonProgress(input: { userId: number; lessonId: number; completed: boolean; timeSpentSeconds: number }) {
      return progress.setLessonProgress(input)
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
      const moduleRow = await content.findModule(moduleId)
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
        ...moduleRow,
        lessons,
        progress: user ? buildModuleProgress(lessons, true) : null,
        quiz: toPublicModuleQuiz(quiz),
        quiz_summary: quizSummary
      }
    },

    // --- Quizzes ----------------------------------------------------------

    /** `userId` is null for anonymous readers, who only see the public quiz. */
    async getModuleQuiz(userId: number | null, moduleId: number) {
      const moduleRow = await content.findModule(moduleId)
      if (!moduleRow) return null

      const quiz = buildModuleQuiz(moduleRow)
      const summary = userId !== null ? await quizAttempts.getSummary(userId, moduleId) : null
      const eligibility = userId !== null ? await quizAttempts.checkEligibility(userId, moduleRow) : null

      return { quiz: toPublicModuleQuiz(quiz), summary, eligibility }
    },

    async submitQuizAttempt(userId: number, moduleId: number, answers: Record<string, unknown>): Promise<QuizAttemptOutcome> {
      const moduleRow = await content.findModule(moduleId)
      if (!moduleRow) return { status: 'not_found' }

      const eligibility = await quizAttempts.checkEligibility(userId, moduleRow)
      if (!eligibility.allowed) return { status: 'not_eligible', eligibility }

      const quiz = buildModuleQuiz(moduleRow)
      if (quiz.questions.length === 0) return { status: 'no_questions' }

      const normalizedAnswers: Record<string, number> = {}
      const hasInvalidAnswer = quiz.questions.some(question => {
        const rawAnswer = answers[question.id]
        if (typeof rawAnswer !== 'number') return true
        if (!Number.isInteger(rawAnswer) || rawAnswer < 0 || rawAnswer >= question.options.length) return true
        normalizedAnswers[question.id] = rawAnswer
        return false
      })
      if (hasInvalidAnswer) return { status: 'invalid_answers' }

      const attempt = await quizAttempts.save(userId, moduleRow, normalizedAnswers, gradeModuleQuiz(moduleRow, normalizedAnswers))
      await progress.touchRoadmapProgress({
        userId,
        roadmapId: moduleRow.roadmap_id,
        moduleId: moduleRow.id
      })
      const summary = await quizAttempts.getSummary(userId, moduleId)
      const updatedEligibility = await quizAttempts.checkEligibility(userId, moduleRow)

      return { status: 'ok', attempt, summary, eligibility: updatedEligibility }
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

      const evidence = await evidences.save(userId, moduleId, input)
      await progress.touchRoadmapProgress({
        userId,
        roadmapId: moduleRow.roadmap_id,
        moduleId
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

    exportPortfolioMarkdown: exportPortfolioAsMarkdown
  }
}
