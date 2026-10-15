import { z } from 'zod'

/** Authenticated user as returned by `GET /api/auth/me`. */
export const authUserSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  name: z.string().nullable().optional(),
  role: z.enum(['admin', 'user'])
})

export const meResponseSchema = z.object({
  user: authUserSchema.nullable().meta({ description: '`null` cuando no hay sesión válida.' })
})

export const loginResponseSchema = z.object({
  user: z.object({
    id: z.number().int(),
    email: z.string(),
    name: z.string().nullable(),
    role: z.string()
  })
})

export const logoutResponseSchema = z.object({ ok: z.literal(true) })

export const setupStatusResponseSchema = z.object({
  needsSetup: z.boolean(),
  requiresToken: z.boolean().meta({ description: 'Hay un `AUTH_SETUP_TOKEN` configurado.' }),
  productionRequiresToken: z.boolean().meta({ description: 'El servidor corre en producción (`NODE_ENV=production`).' })
})

export const setupResponseSchema = z.object({
  user: z.object({
    id: z.number().int(),
    email: z.string(),
    name: z.string().nullable().optional(),
    role: z.literal('admin')
  })
})

/**
 * Body of `POST /api/auth/setup`: the validated fields plus the optional
 * `setupToken`, which the handler reads before validating the rest.
 */
export const setupRequestExtraSchema = z.object({
  setupToken: z.string().optional().meta({ description: 'Obligatorio si el servidor tiene `AUTH_SETUP_TOKEN` (y en producción).' })
})

export type AuthUserContract = z.infer<typeof authUserSchema>
export type MeResponse = z.infer<typeof meResponseSchema>
export type LoginResponse = z.infer<typeof loginResponseSchema>
export type LogoutResponse = z.infer<typeof logoutResponseSchema>
export type SetupStatusResponse = z.infer<typeof setupStatusResponseSchema>
export type SetupResponse = z.infer<typeof setupResponseSchema>
