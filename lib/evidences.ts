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

export async function getModuleEvidence(db: any, userId: number, moduleId: number): Promise<ModuleEvidence | null> {
  const row = await db.get(
    `SELECT id, user_id, module_id, evidence_type, url, note,
            COALESCE(review_status, 'pendiente') AS review_status,
            admin_comment, reviewed_at, reviewed_by_user_id, created_at, updated_at
     FROM user_module_evidences
     WHERE user_id = ? AND module_id = ?`,
    [userId, moduleId]
  )
  return row || null
}

export async function saveModuleEvidence(
  db: any,
  userId: number,
  moduleId: number,
  input: { evidenceType: EvidenceType; url: string | null; note: string | null }
): Promise<ModuleEvidence> {
  const now = new Date().toISOString()
  await db.run(
    `INSERT INTO user_module_evidences (
       user_id, module_id, evidence_type, url, note, review_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'pendiente', ?, ?)
     ON CONFLICT(user_id, module_id) DO UPDATE SET
       evidence_type = excluded.evidence_type,
       url = excluded.url,
       note = excluded.note,
       review_status = 'pendiente',
       updated_at = excluded.updated_at`,
    [userId, moduleId, input.evidenceType, input.url, input.note, now, now]
  )

  return await getModuleEvidence(db, userId, moduleId) as ModuleEvidence
}

export async function reviewModuleEvidence(
  db: any,
  evidenceId: number,
  adminUserId: number,
  input: { reviewStatus: EvidenceReviewStatus; adminComment?: string | null }
): Promise<ModuleEvidence | null> {
  if (!EVIDENCE_REVIEW_STATUSES.includes(input.reviewStatus)) {
    throw new Error('Estado de revisión no válido')
  }

  const now = new Date().toISOString()
  const comment = input.adminComment?.trim() ? input.adminComment.trim() : null

  await db.run(
    `UPDATE user_module_evidences
     SET review_status = ?,
         admin_comment = ?,
         reviewed_at = ?,
         reviewed_by_user_id = ?,
         updated_at = ?
     WHERE id = ?`,
    [input.reviewStatus, comment, now, adminUserId, now, evidenceId]
  )

  const row = await db.get(
    `SELECT id, user_id, module_id, evidence_type, url, note,
            COALESCE(review_status, 'pendiente') AS review_status,
            admin_comment, reviewed_at, reviewed_by_user_id, created_at, updated_at
     FROM user_module_evidences
     WHERE id = ?`,
    [evidenceId]
  )

  return row || null
}
