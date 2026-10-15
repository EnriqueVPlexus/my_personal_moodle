import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../../lib/http/audit'
import { requireAdmin } from '../../../lib/auth'
import { openDb } from '../../../lib/persistence'
import {
  persistRoadmapImport,
  RoadmapImportConflictError,
  validateRoadmapImport
} from '../../../lib/roadmapImport'
import { parseOrRespond, sendValidationIssues } from '../../../lib/validation/http'
import { MAX_IMPORT_BYTES, roadmapImportBodySchema } from '../../../lib/validation/import'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }
  const admin = await requireAdmin(req, res, db)
  if (!admin) return

  const body = parseOrRespond(roadmapImportBodySchema, req.body, res)
  if (!body) return

  const serialized = JSON.stringify(body.roadmap ?? null)
  if (Buffer.byteLength(serialized, 'utf8') > MAX_IMPORT_BYTES) {
    return res.status(413).json({ error: 'El JSON no puede superar 1 MB.' })
  }
  const validation = validateRoadmapImport(body.roadmap)
  if (!validation.valid || !validation.roadmap) {
    // validateRoadmapImport already reports `{ path, message }` issues, i.e. the shared contract.
    return sendValidationIssues(res, validation.issues, 'El roadmap contiene errores.')
  }

  const existing = await db.get('SELECT id, title FROM roadmaps WHERE title = ?', [validation.roadmap.title])
  if (body.action === 'preview') {
    return res.status(200).json({ roadmap: validation.roadmap, existing: existing ?? null })
  }
  const strategy = body.strategy!

  try {
    const result = await persistRoadmapImport(db, validation.roadmap, strategy)
    await writeAuditLog({
      db,
      req,
      user: admin,
      action: strategy === 'create' ? 'roadmap.import_create' : 'roadmap.import_update',
      entityType: 'roadmap',
      entityId: result.roadmap_id,
      details: {
        title: validation.roadmap.title,
        modules: validation.roadmap.modules.length,
        created_modules: result.created_modules,
        updated_modules: result.updated_modules
      }
    })
    return res.status(strategy === 'create' ? 201 : 200).json(result)
  } catch (error) {
    if (error instanceof RoadmapImportConflictError) {
      const message = error.code === 'already_exists'
        ? 'Ya existe un roadmap con ese título. Usa la opción de actualizar.'
        : 'No existe un roadmap con ese título para actualizar.'
      return res.status(409).json({ error: message, code: error.code })
    }
    throw error
  }
}
