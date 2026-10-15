import { z } from 'zod'
import { bodyObject, positiveInt, queryObject } from './primitives'

const MAX_QUIZ_ANSWERS = 200

export const quizModuleQuerySchema = queryObject({ id: positiveInt('id') })

// Per-question rules (known question ids, option ranges) depend on the stored
// quiz, so the handler keeps them; here we only guarantee the payload shape.
export const quizAttemptBodySchema = bodyObject({
  answers: z
    .record(z.string().max(100), z.unknown(), { error: 'El campo «answers» debe ser un objeto con las respuestas.' })
    .refine(value => Object.keys(value).length <= MAX_QUIZ_ANSWERS, `No se pueden enviar más de ${MAX_QUIZ_ANSWERS} respuestas.`)
})

export type QuizAttemptBody = z.infer<typeof quizAttemptBodySchema>
