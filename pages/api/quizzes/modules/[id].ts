import type { NextApiRequest, NextApiResponse } from 'next'
import { withApiErrors } from '../../../../lib/http/errors'
import { createServices } from '../../../../lib/container'
import { getUserFromRequest, requireReadAccess, requireUser } from '../../../../lib/http/auth'
import { openDb } from '../../../../lib/persistence'
import { parseOrRespond } from '../../../../lib/validation/http'
import { quizAttemptBodySchema, quizModuleQuerySchema } from '../../../../lib/validation/quizzes'
import { methodNotAllowed } from '../../../../lib/http/methods'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb()
  const params = parseOrRespond(quizModuleQuerySchema, req.query, res)
  if (!params) return
  const moduleId = params.id
  const { progress } = createServices(db)

  if (req.method === 'GET') {
    if (!(await requireReadAccess(req, res, db))) return

    const user = await getUserFromRequest(req, db)
    const result = await progress.getModuleQuiz(user ? user.id : null, moduleId)
    if (!result) return res.status(404).json({ error: 'No encontrado.' })

    return res.status(200).json(result)
  }

  if (req.method === 'POST') {
    const user = await requireUser(req, res, db)
    if (!user) return

    const body = parseOrRespond(quizAttemptBodySchema, req.body, res)
    if (!body) return

    const outcome = await progress.submitQuizAttempt(user.id, moduleId, body.answers, body.attempt_id)

    if (outcome.status === 'not_found') return res.status(404).json({ error: 'No encontrado.' })
    if (outcome.status === 'not_eligible') {
      return res.status(429).json({
        error: outcome.eligibility.cooldown_ends_at
          ? 'Debes esperar antes de volver a intentarlo.'
          : 'Has alcanzado el limite de intentos permitidos para este modulo.',
        eligibility: outcome.eligibility
      })
    }
    if (outcome.status === 'session_unavailable') {
      return res.status(409).json({ error: 'El intento ya se envió o ha caducado. Recarga el cuestionario para empezar uno nuevo.' })
    }
    if (outcome.status === 'no_questions') {
      return res.status(422).json({ error: 'El módulo no tiene preguntas de cuestionario.' })
    }
    if (outcome.status === 'invalid_answers') {
      return res.status(400).json({ error: 'Responde a todas las preguntas del cuestionario con una opción válida.' })
    }

    return res.status(201).json({
      ...outcome.attempt,
      attempt_id: outcome.attemptId,
      summary: outcome.summary,
      eligibility: outcome.eligibility
    })
  }

  return methodNotAllowed(res, 'GET, POST')
}

export default withApiErrors(handler)
