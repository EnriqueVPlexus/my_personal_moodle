import type { DatabaseClient } from './persistence/database'
import { createAuditService } from './domains/audit'
import { createAuthService } from './domains/auth'
import { makeContentService } from './domains/content'
import { createCatalogRepository } from './domains/content/repositories/catalogRepository'
import { createImportRepository } from './domains/content/repositories/importRepository'
import { createLessonRepository } from './domains/content/repositories/lessonRepository'
import { createMetadataRepository } from './domains/content/repositories/metadataRepository'
import { createModuleRepository } from './domains/content/repositories/moduleRepository'
import { createRoadmapRepository, findExistingRoadmapIds, findRoadmapById } from './domains/content/repositories/roadmapRepository'
import { makeAdminService } from './domains/admin'
import { createDashboardRepository } from './domains/admin/repositories/dashboardRepository'
import { createUserAdminRepository } from './domains/admin/repositories/userRepository'
import { makeProgressService } from './domains/progress'
import { createEvidenceRepository } from './domains/progress/repositories/evidenceRepository'
import { createLearnerViewRepository } from './domains/progress/repositories/learnerViewRepository'
import { createPortfolioRepository } from './domains/progress/repositories/portfolioRepository'
import { createProgressRepository } from './domains/progress/repositories/progressRepository'
import { createQuizAttemptRepository } from './domains/progress/repositories/quizRepository'

/**
 * Composition root: builds every domain service from a DatabaseClient.
 *
 * This is the only place that knows which repository implements which port
 * and how domains are connected to each other (cross-domain ports such as the
 * content catalog reading the learner's progress, or the learner views
 * reading catalog rows). No DI framework: each factory is a plain function
 * and services are cheap closures, so handlers build them per request from
 * `openDb()`.
 */
export function createServices(db: DatabaseClient) {
  // Each unit of work opens ONE transaction and builds the repositories it
  // exposes from the tx client (see lib/domains/shared/unitOfWork.ts), so the
  // domains stay unaware of persistence. Reads outside `run` use `db`.
  const modules = createModuleRepository(db)
  const metadata = createMetadataRepository(db)
  const progress = createProgressRepository(db)

  const content = makeContentService({
    roadmaps: createRoadmapRepository(db),
    metadata,
    catalog: createCatalogRepository(db),
    modules,
    lessons: createLessonRepository(db),
    imports: createImportRepository(db),
    learnerProgress: { listUserRoadmapProgress: userId => progress.listUserRoadmapProgress(userId) },
    unitOfWork: {
      run: work => db.transaction(tx => work({
        roadmaps: createRoadmapRepository(tx),
        metadata: createMetadataRepository(tx)
      }))
    }
  })

  const learning = makeProgressService({
    progress,
    learnerViews: createLearnerViewRepository(db),
    quizAttempts: createQuizAttemptRepository(db),
    evidences: createEvidenceRepository(db),
    portfolios: createPortfolioRepository(db),
    content: {
      findRoadmap: id => findRoadmapById(db, id),
      findModule: id => modules.findById(id),
      getRoadmapTopics: roadmapId => metadata.getTopics(roadmapId)
    },
    unitOfWork: {
      run: work => db.transaction(tx => work({
        progress: createProgressRepository(tx),
        quizAttempts: createQuizAttemptRepository(tx),
        evidences: createEvidenceRepository(tx)
      }))
    }
  })

  const admin = makeAdminService({
    users: createUserAdminRepository(db),
    dashboards: createDashboardRepository(db),
    roadmaps: { findExistingIds: ids => findExistingRoadmapIds(db, ids) },
    unitOfWork: {
      run: work => db.transaction(tx => work({ users: createUserAdminRepository(tx) }))
    }
  })

  return {
    auth: createAuthService(db),
    audit: createAuditService(db),
    content,
    progress: learning,
    admin
  }
}

export type Services = ReturnType<typeof createServices>
