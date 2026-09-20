import type { NextApiRequest, NextApiResponse } from 'next'
import { getRoadmapReadScope, requireUser, scopeAllowsRoadmap } from '../../../../lib/auth'
import { openDb } from '../../../../lib/db'
import { deleteModuleEvidence, getModuleEvidence, saveModuleEvidence } from '../../../../lib/evidenceRepository'
import { validateEvidenceInput } from '../../../../lib/evidences'
import { findModuleById } from '../../../../lib/moduleRepository'
import { touchRoadmapProgress } from '../../../../lib/progressRepository'

function getId(value: string | string[] | undefined) {
  const id = Number(Array.isArray(value) ? value[0] : value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const moduleId = getId(req.query.id)
  if (!moduleId) return res.status(400).json({ error: 'invalid module id' })

  if (req.method === 'GET') {
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return
    if (!scope.user) return res.status(401).json({ error: 'authentication required' })

    const moduleRow = await findModuleById(db, moduleId)
    if (!moduleRow || !scopeAllowsRoadmap(scope, moduleRow.roadmap_id)) {
      return res.status(404).json({ error: 'not found' })
    }

    return res.status(200).json({
      evidence: await getModuleEvidence(db, scope.user.id, moduleId)
    })
  }

  if (req.method === 'PUT') {
    const user = await requireUser(req, res, db)
    if (!user) return

    const moduleRow = await findModuleById(db, moduleId)
    if (!moduleRow) return res.status(404).json({ error: 'not found' })

    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope || !scopeAllowsRoadmap(scope, moduleRow.roadmap_id)) {
      return res.status(404).json({ error: 'not found' })
    }

    const validation = validateEvidenceInput(req.body || {})
    if ('error' in validation) return res.status(400).json({ error: validation.error })

    const evidence = await saveModuleEvidence(db, user.id, moduleId, validation.value)
    await touchRoadmapProgress(db, {
      userId: user.id,
      roadmapId: moduleRow.roadmap_id,
      moduleId
    })

    return res.status(200).json({ evidence })
  }

  if (req.method === 'DELETE') {
    const user = await requireUser(req, res, db)
    if (!user) return
    const moduleRow = await findModuleById(db, moduleId)
    if (!moduleRow) return res.status(404).json({ error: 'not found' })
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope || !scopeAllowsRoadmap(scope, moduleRow.roadmap_id)) {
      return res.status(404).json({ error: 'not found' })
    }
    const changes = await deleteModuleEvidence(db, user.id, moduleId)
    if (!changes) return res.status(404).json({ error: 'not found' })
    return res.status(204).end()
  }

  res.setHeader('Allow', 'GET, PUT, DELETE')
  return res.status(405).end('Method Not Allowed')
}
