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
  | { value: { evidenceType: EvidenceType; url: string | null; note: string | null }; error?: never; field?: never }
  | { value?: never; error: string; field?: 'evidence_type' | 'url' | 'note' }

export function validateEvidenceInput(input: EvidenceInput): EvidenceValidation {
  if (!EVIDENCE_TYPES.includes(input.evidence_type as EvidenceType)) {
    return { error: 'El tipo de evidencia no es válido.', field: 'evidence_type' }
  }

  if (input.url !== undefined && input.url !== null && typeof input.url !== 'string') {
    return { error: 'El campo «url» debe ser un texto.', field: 'url' }
  }
  if (input.note !== undefined && input.note !== null && typeof input.note !== 'string') {
    return { error: 'El campo «nota» debe ser un texto.', field: 'note' }
  }

  const url = typeof input.url === 'string' && input.url.trim() ? input.url.trim() : null
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null

  if (!url && !note) return { error: 'Indica una URL o una nota.', field: 'url' }
  if (url && url.length > 2048) return { error: 'La URL no puede superar 2048 caracteres.', field: 'url' }
  if (note && note.length > 4000) return { error: 'La nota no puede superar 4000 caracteres.', field: 'note' }

  if (url) {
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { error: 'La URL debe usar http o https.', field: 'url' }
      }
    } catch {
      return { error: 'La URL no es válida.', field: 'url' }
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
