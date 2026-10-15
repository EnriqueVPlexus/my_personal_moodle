import type { DatabaseClient } from './persistence/database'
import { createAuditService } from './domains/audit'
import { createAuthService } from './domains/auth'
import { makeContentService } from './domains/content'
import { createCatalogRepository } from './domains/content/repositories/catalogRepository'
import { createImportRepository } from './domains/content/repositories/importRepository'
import { createLessonRepository } from './domains/content/repositories/lessonRepository'
import { createMetadataRepository } from './domains/content/repositories/metadataRepository'
import { createModuleRepository } from './domains/content/repositories/moduleRepository'
import { createRoadmapRepository } from './domains/content/repositories/roadmapRepository'
import { listUserRoadmapProgress } from './progressRepository'

/**
 * Composition root: builds every domain service from a DatabaseClient.
 *
 * This is the only place that knows which repository implements which port
 * and how domains are connected to each other (cross-domain ports such as the
 * content catalog reading the learner's progress). No DI framework: each
 * factory is a plain function and services are cheap closures, so handlers
 * build them per request from `openDb()`.
 */
export function createServices(db: DatabaseClient) {
  const content = makeContentService({
    roadmaps: createRoadmapRepository(db),
    metadata: createMetadataRepository(db),
    catalog: createCatalogRepository(db),
    modules: createModuleRepository(db),
    lessons: createLessonRepository(db),
    imports: createImportRepository(db),
    learnerProgress: {
      listUserRoadmapProgress: userId => listUserRoadmapProgress(db, userId)
    }
  })

  return {
    auth: createAuthService(db),
    audit: createAuditService(db),
    content
  }
}

export type Services = ReturnType<typeof createServices>
