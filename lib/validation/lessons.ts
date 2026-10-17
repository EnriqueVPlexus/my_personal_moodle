import { z } from 'zod'
import { bodyObject, positiveInt, queryObject, strictBoolean, text } from './primitives'

export const lessonIdQuerySchema = queryObject({ id: positiveInt('id') })
export const lessonListQuerySchema = queryObject({ module_id: positiveInt('module_id') })

export const createLessonBodySchema = bodyObject({
  title: text('título', 200),
  module_id: positiveInt('module_id')
})

export const updateLessonBodySchema = bodyObject({
  title: text('título', 200),
  completed: strictBoolean('completed').optional()
})

export type CreateLessonBody = z.infer<typeof createLessonBodySchema>
export type UpdateLessonBody = z.infer<typeof updateLessonBodySchema>
