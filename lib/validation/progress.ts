import { z } from 'zod'
import { MAX_LESSON_TIME_INCREMENT_SECONDS } from '../progressRepository'
import { bodyObject, positiveInt, queryObject } from './primitives'

export const lessonProgressQuerySchema = queryObject({ id: positiveInt('id') })

// Accepts the same truthy/falsy spellings the endpoint always accepted.
const completedField = z
  .union(
    [z.boolean(), z.literal(1), z.literal(0), z.literal('1'), z.literal('0')],
    { error: 'El campo «completed» debe ser verdadero o falso.' }
  )
  .transform(value => value === true || value === 1 || value === '1')

const TIME_SPENT_MESSAGE = 'El campo «time_spent_seconds» debe ser un número no negativo.'

const timeSpentField = z
  .union([z.number(), z.string().min(1, TIME_SPENT_MESSAGE).max(20, TIME_SPENT_MESSAGE)], {
    error: TIME_SPENT_MESSAGE
  })
  .transform((value, ctx) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric < 0) {
      ctx.issues.push({ code: 'custom', message: TIME_SPENT_MESSAGE, input: value })
      return z.NEVER
    }
    return Math.min(MAX_LESSON_TIME_INCREMENT_SECONDS, Math.round(numeric))
  })
  .optional()

export const lessonProgressBodySchema = bodyObject({
  completed: completedField,
  time_spent_seconds: timeSpentField
})

export type LessonProgressBody = z.infer<typeof lessonProgressBodySchema>
