import type { NextApiRequest, NextApiResponse } from 'next'
import { createServices } from '../../../../lib/container'
import { getRoadmapReadScope, requireUser } from '../../../../lib/http/auth'
import { openDb } from '../../../../lib/persistence'
import { evidenceModuleQuerySchema, saveEvidenceBodySchema } from '../../../../lib/validation/evidences'
import { parseOrRespond } from '../../../../lib/validation/http'
import { methodNotAllowed } from '../../../../lib/http/methods'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const params = parseOrRespond(evidenceModuleQuerySchema, req.query, res)
  if (!params) return
  const moduleId = params.id
  const { progress } = createServices(db)

  if (req.method === 'GET') {
    const scope = await getRoadmapReadScope(req, res, db)
    if (!scope) return
    if (!scope.user) return res.status(401).json({ error: 'Debes iniciar sesión.' })

    const result = await progress.getModuleEvidence(scope, scope.user.id, moduleId)
    if (!result) return res.status(404).json({ error: 'No encontrado.' })

    return res.status(200).json(result)
  }

  if (req.method === 'PUT') {
    const user = await requireUser(req, res, db)
    if (!user) return

    const body = parseOrRespond(saveEvidenceBodySchema, req.body, res)
    if (!body) return

    const result = await progress.saveModuleEvidence(user.id, moduleId, body, () => getRoadmapReadScope(req, res, db))
    if (!result) return res.status(404).json({ error: 'No encontrado.' })

    return res.status(200).json(result)
  }

  if (req.method === 'DELETE') {
    const user = await requireUser(req, res, db)
    if (!user) return

    const deleted = await progress.deleteModuleEvidence(user.id, moduleId, () => getRoadmapReadScope(req, res, db))
    if (!deleted) return res.status(404).json({ error: 'No encontrado.' })
    return res.status(204).end()
  }

  return methodNotAllowed(res, 'GET, PUT, DELETE')
}
