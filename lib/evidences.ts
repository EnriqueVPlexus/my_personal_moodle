export const EVIDENCE_TYPES = ['github', 'demo', 'document', 'note'] as const

export type EvidenceType = typeof EVIDENCE_TYPES[number]

export type ModuleEvidence = {
  id: number
  user_id: number
  module_id: number
  evidence_type: EvidenceType
  url?: string | null
  note?: string | null
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
  return await db.get(
    `SELECT id, user_id, module_id, evidence_type, url, note, created_at, updated_at
     FROM user_module_evidences
     WHERE user_id = ? AND module_id = ?`,
    [userId, moduleId]
  ) || null
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
       user_id, module_id, evidence_type, url, note, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, module_id) DO UPDATE SET
       evidence_type = excluded.evidence_type,
       url = excluded.url,
       note = excluded.note,
       updated_at = excluded.updated_at`,
    [userId, moduleId, input.evidenceType, input.url, input.note, now, now]
  )

  return await getModuleEvidence(db, userId, moduleId) as ModuleEvidence
}
