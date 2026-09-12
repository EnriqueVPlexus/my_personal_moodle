import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../../lib/auth'
import { openDb } from '../../../../lib/db'
import {
  EVIDENCE_REVIEW_STATUSES,
  EvidenceReviewStatus,
  reviewModuleEvidence
} from '../../../../lib/evidences'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT')
    return res.status(405).end('Method Not Allowed')
  }

  const db = await openDb()
  const admin = await requireAdmin(req, res, db)
  if (!admin) return

  const { id } = req.query
  const evidenceId = Number(id)
  if (!Number.isInteger(evidenceId) || evidenceId <= 0) {
    return res.status(400).json({ error: 'ID de evidencia no válido' })
  }

  const { review_status, admin_comment } = req.body || {}
  if (!EVIDENCE_REVIEW_STATUSES.includes(review_status as EvidenceReviewStatus)) {
    return res.status(400).json({ error: 'Estado de revisión no válido' })
  }

  if (admin_comment !== undefined && admin_comment !== null && typeof admin_comment !== 'string') {
    return res.status(400).json({ error: 'El comentario del administrador debe ser un texto' })
  }

  try {
    const updated = await reviewModuleEvidence(db, evidenceId, admin.id, {
      reviewStatus: review_status as EvidenceReviewStatus,
      adminComment: admin_comment
    })

    if (!updated) {
      return res.status(404).json({ error: 'Evidencia no encontrada' })
    }

    return res.status(200).json(updated)
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message || 'Error al revisar la evidencia' })
  }
}
