import type { NextApiRequest, NextApiResponse } from 'next'
import { getRoadmapReadScope, requireUser, scopeAllowsRoadmap } from '../../../../lib/http/auth'
import { openDb } from '../../../../lib/persistence'
import { deleteModuleEvidence, getModuleEvidence, saveModuleEvidence } from '../../../../lib/evidenceRepository'
import { findModuleById } from '../../../../lib/moduleRepository'
import { touchRoadmapProgress } from '../../../../lib/progressRepository'
import { evidenceModuleQuerySchema, saveEvidenceBodySchema } from '../../../../lib/validation/evidences'
import { parseOrRespond } from '../../../../lib/validation/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const params = parseOrRespond(evidenceModuleQuerySchema, req.query, res)
  if (!params) return
  const moduleId = params.id

  if (req.method === 'GET') {
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return
    if (!scope.user) return res.status(401).json({ error: 'Debes iniciar sesión.' })

    const moduleRow = await findModuleById(db, moduleId)
    if (!moduleRow || !scopeAllowsRoadmap(scope, moduleRow.roadmap_id)) {
      return res.status(404).json({ error: 'No encontrado.' })
    }

    return res.status(200).json({
      evidence: await getModuleEvidence(db, scope.user.id, moduleId)
    })
  }

  if (req.method === 'PUT') {
    const user = await requireUser(req, res, db)
    if (!user) return

    const body = parseOrRespond(saveEvidenceBodySchema, req.body, res)
    if (!body) return

    const moduleRow = await findModuleById(db, moduleId)
    if (!moduleRow) return res.status(404).json({ error: 'No encontrado.' })

    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope || !scopeAllowsRoadmap(scope, moduleRow.roadmap_id)) {
      return res.status(404).json({ error: 'No encontrado.' })
    }

    const evidence = await saveModuleEvidence(db, user.id, moduleId, body)
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
    if (!moduleRow) return res.status(404).json({ error: 'No encontrado.' })
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope || !scopeAllowsRoadmap(scope, moduleRow.roadmap_id)) {
      return res.status(404).json({ error: 'No encontrado.' })
    }
    const changes = await deleteModuleEvidence(db, user.id, moduleId)
    if (!changes) return res.status(404).json({ error: 'No encontrado.' })
    return res.status(204).end()
  }

  res.setHeader('Allow', 'GET, PUT, DELETE')
  return res.status(405).end('Method Not Allowed')
}
