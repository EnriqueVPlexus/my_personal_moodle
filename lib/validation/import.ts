import { z } from 'zod'
import { roadmapImportSchema } from '../domains/content/importSchema'
import { bodyObject } from './primitives'

export const MAX_IMPORT_BYTES = 1024 * 1024

const action = z.enum(['preview', 'publish'], { error: 'Acción de importación no válida.' })
const strategy = z.enum(['create', 'update'], { error: 'La estrategia debe ser create o update.' }).optional()

// Envelope only. At runtime `roadmap` stays `unknown` on purpose: the document is
// validated in depth by validateRoadmapImport (lib/domains/content/import.ts) with
// roadmapImportSchema, and its problems are returned as per-field `issues`, not
// as an envelope error. The contract below describes the full document.
export const roadmapImportBodySchema = bodyObject({
  action,
  strategy,
  roadmap: z.unknown().optional()
}).superRefine((body, ctx) => {
  if (body.action === 'publish' && body.strategy === undefined) {
    ctx.addIssue({ code: 'custom', message: 'La estrategia debe ser create o update.', path: ['strategy'] })
  }
})

/** Same envelope for the OpenAPI contract, with the whole roadmap document described (`RoadmapImportDocument`). */
export const roadmapImportBodyContractSchema = bodyObject({
  action,
  strategy,
  roadmap: roadmapImportSchema.optional().meta({
    description: 'Documento del roadmap (ver `GET /api/roadmaps/{id}/export`). Máximo 1 MB serializado.'
  })
})

export type RoadmapImportBody = z.infer<typeof roadmapImportBodySchema>
