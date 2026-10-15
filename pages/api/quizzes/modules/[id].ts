import type { NextApiRequest, NextApiResponse } from 'next'
import { getUserFromRequest, requireReadAccess, requireUser } from '../../../../lib/http/auth'
import { openDb } from '../../../../lib/persistence'
import { findModuleById } from '../../../../lib/moduleRepository'
import { touchRoadmapProgress } from '../../../../lib/progressRepository'
import { checkAttemptEligibility, getModuleQuizSummary, saveModuleQuizAttempt } from '../../../../lib/quizRepository'
import { buildModuleQuiz, toPublicModuleQuiz } from '../../../../lib/quizzes'
import { parseOrRespond } from '../../../../lib/validation/http'
import { quizAttemptBodySchema, quizModuleQuerySchema } from '../../../../lib/validation/quizzes'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const params = parseOrRespond(quizModuleQuerySchema, req.query, res)
  if (!params) return
  const moduleId = params.id

  if (req.method === 'GET') {
    if (!(await requireReadAccess(req, res, db))) return
    const moduleRow = await findModuleById(db, moduleId)
    if (!moduleRow) return res.status(404).json({ error: 'No encontrado.' })

    const user = await getUserFromRequest(req, db)
    const quiz = buildModuleQuiz(moduleRow)
    const summary = user ? await getModuleQuizSummary(db, user.id, moduleId) : null
    const eligibility = user ? await checkAttemptEligibility(db, user.id, moduleRow) : null

    return res.status(200).json({
      quiz: toPublicModuleQuiz(quiz),
      summary,
      eligibility
    })
  }

  if (req.method === 'POST') {
    const user = await requireUser(req, res, db)
    if (!user) return

    const body = parseOrRespond(quizAttemptBodySchema, req.body, res)
    if (!body) return
    const { answers } = body

    const moduleRow = await findModuleById(db, moduleId)
    if (!moduleRow) return res.status(404).json({ error: 'No encontrado.' })

    // Fase 3: comprobar elegibilidad antes de procesar el intento
    const eligibility = await checkAttemptEligibility(db, user.id, moduleRow)
    if (!eligibility.allowed) {
      return res.status(429).json({
        error: eligibility.cooldown_ends_at
          ? 'Debes esperar antes de volver a intentarlo.'
          : 'Has alcanzado el limite de intentos permitidos para este modulo.',
        eligibility
      })
    }

    const quiz = buildModuleQuiz(moduleRow)
    if (quiz.questions.length === 0) {
      return res.status(422).json({ error: 'El módulo no tiene preguntas de cuestionario.' })
    }

    const normalizedAnswers: Record<string, number> = {}
    const hasInvalidAnswer = quiz.questions.some(question => {
      const rawAnswer = answers[question.id]
      if (typeof rawAnswer !== 'number') return true
      const answer = rawAnswer
      if (!Number.isInteger(answer) || answer < 0 || answer >= question.options.length) return true
      normalizedAnswers[question.id] = answer
      return false
    })
    if (hasInvalidAnswer) {
      return res.status(400).json({ error: 'Responde a todas las preguntas del cuestionario con una opción válida.' })
    }

    const attempt = await saveModuleQuizAttempt(db, user.id, moduleRow, normalizedAnswers)
    await touchRoadmapProgress(db, {
      userId: user.id,
      roadmapId: moduleRow.roadmap_id,
      moduleId: moduleRow.id
    })
    const summary = await getModuleQuizSummary(db, user.id, moduleId)
    const updatedEligibility = await checkAttemptEligibility(db, user.id, moduleRow)

    return res.status(201).json({
      ...attempt,
      summary,
      eligibility: updatedEligibility
    })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).end('Method Not Allowed')
}
