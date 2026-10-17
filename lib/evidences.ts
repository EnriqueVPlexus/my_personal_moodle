export const EVIDENCE_TYPES = ['github', 'demo', 'document', 'note'] as const

export type EvidenceType = typeof EVIDENCE_TYPES[number]

export const EVIDENCE_REVIEW_STATUSES = ['pendiente', 'aprobado', 'requiere_cambios'] as const

export type EvidenceReviewStatus = typeof EVIDENCE_REVIEW_STATUSES[number]

export type ModuleEvidence = {
  id: number
  user_id: number
  module_id: number
  evidence_type: EvidenceType
  url?: string | null
  note?: string | null
  review_status: EvidenceReviewStatus
  admin_comment?: string | null
  reviewed_at?: string | null
  reviewed_by_user_id?: number | null
  created_at: string
  updated_at: string
}

type EvidenceInput = {
  evidence_type?: unknown
  url?: unknown
  note?: unknown
}

type EvidenceValidation =
  | { value: { evidenceType: EvidenceType; url: string | null; note: string | null }; error?: never }
  | { value?: never; error: string }

export function validateEvidenceInput(input: EvidenceInput): EvidenceValidation {
  if (!EVIDENCE_TYPES.includes(input.evidence_type as EvidenceType)) {
    return { error: 'invalid evidence type' }
  }

  if (input.url !== undefined && input.url !== null && typeof input.url !== 'string') {
    return { error: 'url must be a string' }
  }
  if (input.note !== undefined && input.note !== null && typeof input.note !== 'string') {
    return { error: 'note must be a string' }
  }

  const url = typeof input.url === 'string' && input.url.trim() ? input.url.trim() : null
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null

  if (!url && !note) return { error: 'url or note required' }
  if (url && url.length > 2048) return { error: 'url is too long' }
  if (note && note.length > 4000) return { error: 'note is too long' }

  if (url) {
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { error: 'url must use http or https' }
      }
    } catch {
      return { error: 'invalid url' }
    }
  }

  return {
    value: {
      evidenceType: input.evidence_type as EvidenceType,
      url,
      note
    }
  }
}
