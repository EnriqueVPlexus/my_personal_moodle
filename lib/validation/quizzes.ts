import { z } from 'zod'
import { bodyObject, positiveInt, queryObject } from './primitives'

const MAX_QUIZ_ANSWERS = 200
const MAX_ATTEMPT_ID_LENGTH = 64

export const quizModuleQuerySchema = queryObject({ id: positiveInt('id') })

// Per-question rules (known question ids, option ranges) depend on the stored
// quiz, so the handler keeps them; here we only guarantee the payload shape.
export const quizAttemptBodySchema = bodyObject({
  attempt_id: z
    .string({ error: 'El campo «attempt_id» debe ser un texto.' })
    .max(MAX_ATTEMPT_ID_LENGTH, `El campo «attempt_id» no puede superar ${MAX_ATTEMPT_ID_LENGTH} caracteres.`)
    .regex(/^[A-Za-z0-9-]+$/, 'El campo «attempt_id» no es válido.')
    .optional()
    .meta({ description: 'Identificador del intento devuelto por `GET /api/quizzes/modules/{id}`. Sin él (clientes antiguos) se corrige el cuestionario determinista de siempre, sin intento.' }),
  answers: z
    .record(z.string().max(100), z.unknown().meta({ type: 'integer', minimum: 0, description: 'Índice de la opción elegida.' }), { error: 'El campo «answers» debe ser un objeto con las respuestas.' })
    .refine(value => Object.keys(value).length <= MAX_QUIZ_ANSWERS, `No se pueden enviar más de ${MAX_QUIZ_ANSWERS} respuestas.`)
})

export type QuizAttemptBody = z.infer<typeof quizAttemptBodySchema>
