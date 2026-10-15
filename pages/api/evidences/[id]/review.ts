import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../../lib/http/audit'
import { requireAdmin } from '../../../../lib/http/auth'
import { openDb } from '../../../../lib/persistence'
import { getEvidenceById, reviewModuleEvidence } from '../../../../lib/evidenceRepository'
import { evidenceReviewQuerySchema, reviewEvidenceBodySchema } from '../../../../lib/validation/evidences'
import { parseOrRespond } from '../../../../lib/validation/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT')
    return res.status(405).end('Method Not Allowed')
  }

  const db = await openDb()
  const admin = await requireAdmin(req, res, db)
  if (!admin) return

  const params = parseOrRespond(evidenceReviewQuerySchema, req.query, res)
  if (!params) return
  const evidenceId = params.id

  const body = parseOrRespond(reviewEvidenceBodySchema, req.body, res)
  if (!body) return

  try {
    const previous = await getEvidenceById(db, evidenceId)
    const updated = await reviewModuleEvidence(db, evidenceId, admin.id, {
      reviewStatus: body.review_status,
      adminComment: body.admin_comment
    })

    if (!updated) {
      return res.status(404).json({ error: 'Evidencia no encontrada' })
    }

    await writeAuditLog({
      db,
      req,
      user: admin,
      action: 'evidence.review',
      entityType: 'evidence',
      entityId: evidenceId,
      details: {
        user_id: updated.user_id,
        module_id: updated.module_id,
        previous_review_status: previous?.review_status ?? null,
        review_status: updated.review_status,
        admin_comment: updated.admin_comment ?? null
      }
    })

    return res.status(200).json(updated)
  } catch (error) {
    // Never expose raw exception messages to clients.
    console.error('evidence review failed', error)
    return res.status(500).json({ error: 'Error al revisar la evidencia.' })
  }
}
