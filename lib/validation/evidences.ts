import { z } from 'zod'
import { EVIDENCE_REVIEW_STATUSES, validateEvidenceInput } from '../domains/progress/evidences'
import type { EvidenceReviewStatus } from '../domains/progress/evidences'
import { bodyObject, optionalPositiveInt, optionalText, positiveInt, queryObject } from './primitives'

export const evidenceModuleQuerySchema = queryObject({ id: positiveInt('id') })
export const evidenceReviewQuerySchema = queryObject({ id: positiveInt('id') })

export const evidenceListQuerySchema = queryObject({
  user_id: optionalPositiveInt('user_id'),
  module_id: optionalPositiveInt('module_id'),
  roadmap_id: optionalPositiveInt('roadmap_id'),
  // Unknown statuses are ignored (unfiltered list), as the endpoint always did.
  status: z
    .unknown()
    .transform(value => (EVIDENCE_REVIEW_STATUSES as readonly unknown[]).includes(value) ? value as EvidenceReviewStatus : undefined)
    .optional()
})

// Field rules (types, url protocol, lengths) live in validateEvidenceInput; the
// schema only adapts its result to the shared error contract.
export const saveEvidenceBodySchema = bodyObject({
  evidence_type: z.unknown().optional(),
  url: z.unknown().optional(),
  note: z.unknown().optional()
}).transform((input, ctx) => {
  const validation = validateEvidenceInput(input)
  if ('error' in validation) {
    ctx.issues.push({ code: 'custom', message: validation.error, input, path: validation.field ? [validation.field] : [] })
    return z.NEVER
  }
  return validation.value
})

export const reviewEvidenceBodySchema = bodyObject({
  review_status: z.enum(EVIDENCE_REVIEW_STATUSES, { error: 'El estado de revisión no es válido.' }),
  admin_comment: optionalText('comentario del administrador', 2000)
})

export type SaveEvidenceBody = z.infer<typeof saveEvidenceBodySchema>
export type ReviewEvidenceBody = z.infer<typeof reviewEvidenceBodySchema>
