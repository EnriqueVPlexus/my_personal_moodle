import type { NextApiRequest, NextApiResponse } from 'next'
import { getUserFromRequest, requireReadAccess, requireUser } from '../../../../lib/auth'
import { openDb } from '../../../../lib/db'
import { touchRoadmapProgress } from '../../../../lib/progress'
import {
  buildModuleQuiz,
  getModuleQuizSummary,
  saveModuleQuizAttempt,
  toPublicModuleQuiz
} from '../../../../lib/quizzes'

function getId(queryId: string | string[] | undefined) {
  const value = Number(Array.isArray(queryId) ? queryId[0] : queryId)
  return Number.isFinite(value) && value > 0 ? value : null
}

function getAnswers(body: unknown) {
  if (!body || typeof body !== 'object' || !('answers' in body)) return null
  const answers = (body as { answers?: unknown }).answers
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return null
  return answers as Record<string, unknown>
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const moduleId = getId(req.query.id)

  if (!moduleId) {
    return res.status(400).json({ error: 'invalid module id' })
  }

  if (req.method === 'GET') {
    if (!(await requireReadAccess(req, res, db))) return
    const moduleRow = await db.get('SELECT * FROM modules WHERE id = ?', [moduleId])
    if (!moduleRow) return res.status(404).json({ error: 'not found' })

    const user = await getUserFromRequest(req, db)
    const quiz = buildModuleQuiz(moduleRow)
    const summary = user ? await getModuleQuizSummary(db, user.id, moduleId) : null

    return res.status(200).json({
      quiz: toPublicModuleQuiz(quiz),
      summary
    })
  }

  if (req.method === 'POST') {
    const user = await requireUser(req, res, db)
    if (!user) return

    const moduleRow = await db.get('SELECT * FROM modules WHERE id = ?', [moduleId])
    if (!moduleRow) return res.status(404).json({ error: 'not found' })

    const quiz = buildModuleQuiz(moduleRow)
    if (quiz.questions.length === 0) {
      return res.status(422).json({ error: 'module has no quiz questions' })
    }

    const answers = getAnswers(req.body)
    if (!answers) {
      return res.status(400).json({ error: 'answers object required' })
    }

    const attempt = await saveModuleQuizAttempt(db, user.id, moduleRow, answers)
    await touchRoadmapProgress(db, {
      userId: user.id,
      roadmapId: moduleRow.roadmap_id,
      moduleId: moduleRow.id
    })
    const summary = await getModuleQuizSummary(db, user.id, moduleId)

    return res.status(201).json({
      ...attempt,
      summary
    })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).end('Method Not Allowed')
}
