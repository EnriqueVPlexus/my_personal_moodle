import type { NextApiRequest, NextApiResponse } from 'next'
import { requireUser } from '../../../../lib/auth'
import { openDb } from '../../../../lib/db'
import { MAX_LESSON_TIME_INCREMENT_SECONDS, setLessonProgress } from '../../../../lib/progress'

function toBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  return null
}

function toTimeSpentSeconds(value: unknown) {
  if (value === undefined) return 0
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return null
  return Math.min(MAX_LESSON_TIME_INCREMENT_SECONDS, Math.round(numeric))
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const lessonId = Number(Array.isArray(req.query.id) ? req.query.id[0] : req.query.id)

  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT')
    return res.status(405).end('Method Not Allowed')
  }

  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return res.status(400).json({ error: 'invalid lesson id' })
  }

  const user = await requireUser(req, res, db)
  if (!user) return

  const completed = toBoolean(req.body?.completed)
  if (completed === null) {
    return res.status(400).json({ error: 'completed must be a boolean' })
  }
  const timeSpentSeconds = toTimeSpentSeconds(req.body?.time_spent_seconds)
  if (timeSpentSeconds === null) {
    return res.status(400).json({ error: 'time_spent_seconds must be a non-negative number' })
  }

  const progress = await setLessonProgress(db, {
    userId: user.id,
    lessonId,
    completed,
    timeSpentSeconds
  })

  if (!progress) {
    return res.status(404).json({ error: 'not found' })
  }

  return res.status(200).json(progress)
}
