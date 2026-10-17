import type { NextApiRequest, NextApiResponse } from 'next'
import { requireUser } from '../../../../lib/auth'
import { openDb } from '../../../../lib/db'
import { setLessonProgress } from '../../../../lib/progressRepository'
import { parseOrRespond } from '../../../../lib/validation/http'
import { lessonProgressBodySchema, lessonProgressQuerySchema } from '../../../../lib/validation/progress'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT')
    return res.status(405).end('Method Not Allowed')
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

  const progress = await setLessonProgress(db, {
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
