import { z } from 'zod'
import { bodyObject, emailField, newPasswordField, optionalText } from './primitives'

const MAX_LOGIN_PASSWORD_LENGTH = 256

// Login stays lenient on the email format (unknown users answer 401 either way)
// and never trims or rewrites the password.
export const loginBodySchema = bodyObject({
  email: z
    .string({ error: 'Introduce tu correo electrónico.' })
    .trim()
    .min(1, 'Introduce tu correo electrónico.')
    .max(254, 'El campo «correo electrónico» no puede superar 254 caracteres.'),
  password: z
    .string({ error: 'Introduce tu contraseña.' })
    .min(1, 'Introduce tu contraseña.')
    .max(MAX_LOGIN_PASSWORD_LENGTH, 'La contraseña es demasiado larga.')
})

export type LoginBody = z.infer<typeof loginBodySchema>

export const setupBodySchema = bodyObject({
  email: emailField,
  name: optionalText('nombre', 120),
  password: newPasswordField
})

export type SetupBody = z.infer<typeof setupBodySchema>
