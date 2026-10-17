import type { NextApiRequest, NextApiResponse } from 'next'
import { withApiErrors } from '../../../../lib/http/errors'
import { createServices } from '../../../../lib/container'
import { requireUser } from '../../../../lib/http/auth'
import { openDb } from '../../../../lib/persistence'
import { parseOrRespond } from '../../../../lib/validation/http'
import { lessonProgressBodySchema, lessonProgressQuerySchema } from '../../../../lib/validation/progress'
import { methodNotAllowed } from '../../../../lib/http/methods'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  if (req.method !== 'PUT') {
    return methodNotAllowed(res, 'PUT')
  }

  const params = parseOrRespond(lessonProgressQuerySchema, req.query, res)
  if (!params) return
  const lessonId = params.id

  const user = await requireUser(req, res, db)
  if (!user) return

  const body = parseOrRespond(lessonProgressBodySchema, req.body, res)
  if (!body) return
  const { completed } = body
  const timeSpentSeconds = body.time_spent_seconds ?? 0

  const progress = await createServices(db).progress.setLessonProgress({
    userId: user.id,
    lessonId,
    completed,
    timeSpentSeconds
  })

  if (!progress) {
    return res.status(404).json({ error: 'No encontrado.' })
  }

  return res.status(200).json(progress)
}

export default withApiErrors(handler)
