import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/auth'
import { openDb } from '../../../lib/db'
import { listEvidences } from '../../../lib/evidenceRepository'
import { EVIDENCE_REVIEW_STATUSES, EvidenceReviewStatus } from '../../../lib/evidences'

function optionalPositiveId(value: string | string[] | undefined) {
  if (value === undefined) return null
  const id = Number(Array.isArray(value) ? value[0] : value)
  return Number.isInteger(id) && id > 0 ? id : NaN
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }

  if (!(await requireAdmin(req, res, db))) return

  const userId = optionalPositiveId(req.query.user_id)
  const moduleId = optionalPositiveId(req.query.module_id)
  const roadmapId = optionalPositiveId(req.query.roadmap_id)
  if ([userId, moduleId, roadmapId].some(value => Number.isNaN(value))) {
    return res.status(400).json({ error: 'invalid filter id' })
  }

  const statusFilter = typeof req.query.status === 'string' && EVIDENCE_REVIEW_STATUSES.includes(req.query.status as EvidenceReviewStatus)
    ? (req.query.status as EvidenceReviewStatus)
    : null

  const evidences = await listEvidences(db, {
    userId,
    moduleId,
    roadmapId,
    status: statusFilter
  })

  return res.status(200).json(evidences)
}
