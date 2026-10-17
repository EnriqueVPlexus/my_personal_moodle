import { z } from 'zod'
import { bodyObject } from './primitives'

export const MAX_IMPORT_BYTES = 1024 * 1024

// Envelope only. The roadmap document itself is validated in depth (with
// per-field `issues`) by validateRoadmapImport in lib/roadmapImport.ts.
export const roadmapImportBodySchema = bodyObject({
  action: z.enum(['preview', 'publish'], { error: 'Acción de importación no válida.' }),
  strategy: z.enum(['create', 'update'], { error: 'La estrategia debe ser create o update.' }).optional(),
  roadmap: z.unknown().optional()
}).superRefine((body, ctx) => {
  if (body.action === 'publish' && body.strategy === undefined) {
    ctx.addIssue({ code: 'custom', message: 'La estrategia debe ser create o update.', path: ['strategy'] })
  }
})

export type RoadmapImportBody = z.infer<typeof roadmapImportBodySchema>
