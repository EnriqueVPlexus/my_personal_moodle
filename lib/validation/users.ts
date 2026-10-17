import { z } from 'zod'
import {
  bodyObject,
  emailField,
  newPasswordField,
  optionalText,
  positiveInt,
  queryObject,
  strictBoolean
} from './primitives'

const MAX_ROADMAP_ACCESS_IDS = 1000

export const userIdQuerySchema = queryObject({ id: positiveInt('id') })

export const createUserBodySchema = bodyObject({
  email: emailField,
  name: optionalText('nombre', 120),
  // Unknown or missing roles fall back to 'user' (long-standing behavior; see VALIDATION.md follow-ups).
  role: z.unknown().transform(value => (value === 'admin' ? 'admin' as const : 'user' as const))
    .optional(),
  password: newPasswordField
})

export type CreateUserBody = z.infer<typeof createUserBodySchema>

const roadmapIdsField = z
  .array(positiveInt('roadmap_ids'), { error: 'El campo «roadmap_ids» debe ser una lista de identificadores.' })
  .max(MAX_ROADMAP_ACCESS_IDS, `No se pueden asignar más de ${MAX_ROADMAP_ACCESS_IDS} roadmaps.`)
  .transform(ids => Array.from(new Set(ids)))

export const updateUserBodySchema = z.discriminatedUnion(
  'action',
  [
    bodyObject({
      action: z.literal('set_active'),
      is_active: strictBoolean('is_active')
    }),
    bodyObject({
      action: z.literal('reset_password'),
      password: newPasswordField
    }),
    bodyObject({
      action: z.literal('set_roadmap_access'),
      can_view_all_roadmaps: strictBoolean('can_view_all_roadmaps'),
      roadmap_ids: roadmapIdsField.optional()
    })
  ],
  { error: 'Acción no admitida.' }
)

export type UpdateUserBody = z.infer<typeof updateUserBodySchema>
