import type { NextApiRequest, NextApiResponse } from 'next'
import { requireUser } from '../../../../lib/auth'
import { openDb } from '../../../../lib/db'
import { setLessonProgress } from '../../../../lib/progress'

function toBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  return null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const lessonId = Number(Array.isArray(req.query.id) ? req.query.id[0] : req.query.id)

  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT')
    return res.status(405).end('Method Not Allowed')
  }

  if (!Number.isFinite(lessonId) || lessonId <= 0) {
    return res.status(400).json({ error: 'invalid lesson id' })
  }

  const user = await requireUser(req, res, db)
  if (!user) return

  const completed = toBoolean(req.body?.completed)
  if (completed === null) {
    return res.status(400).json({ error: 'completed must be a boolean' })
  }

  const progress = await setLessonProgress(db, {
    userId: user.id,
    lessonId,
    completed,
    timeSpentSeconds: req.body?.time_spent_seconds
  })

  if (!progress) {
    return res.status(404).json({ error: 'not found' })
  }

  return res.status(200).json(progress)
}
