import { z } from 'zod'
import { normalizeEmail, validatePassword } from '../domains/auth/password'

const MAX_SAFE_ID = Number.MAX_SAFE_INTEGER

function describeType(input: unknown) {
  return input === undefined || input === null
}

/** Required, trimmed, non-empty text with a maximum length. */
export function text(label: string, max: number) {
  return z
    .string({ error: issue => (describeType(issue.input) ? `Falta el campo «${label}».` : `El campo «${label}» debe ser un texto.`) })
    .trim()
    .min(1, `El campo «${label}» no puede estar vacío.`)
    .max(max, `El campo «${label}» no puede superar ${max} caracteres.`)
}

/** Optional (or null) trimmed text with a maximum length. Empty strings are allowed. */
export function optionalText(label: string, max: number) {
  return z
    .string({ error: `El campo «${label}» debe ser un texto.` })
    .trim()
    .max(max, `El campo «${label}» no puede superar ${max} caracteres.`)
    .nullish()
}

function toPositiveInt(raw: unknown): number | null {
  const value = typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= MAX_SAFE_ID
    ? value
    : null
}

/**
 * Positive integer id. Accepts numbers and numeric strings (query strings and
 * JSON bodies); for repeated query params (`?id=1&id=2`) the first value wins.
 */
export function positiveInt(label: string) {
  return z.unknown().transform((value, ctx) => {
    const raw = Array.isArray(value) ? value[0] : value
    if (raw === undefined || raw === null || raw === '') {
      ctx.issues.push({ code: 'custom', message: `Falta el campo «${label}».`, input: value })
      return z.NEVER
    }
    const id = toPositiveInt(raw)
    if (id === null) {
      ctx.issues.push({ code: 'custom', message: `El campo «${label}» debe ser un número entero positivo.`, input: value })
      return z.NEVER
    }
    return id
  })
}

export function optionalPositiveInt(label: string) {
  return positiveInt(label).optional()
}

export function strictBoolean(label: string) {
  return z.boolean({
    error: issue => (describeType(issue.input) ? `Falta el campo «${label}».` : `El campo «${label}» debe ser verdadero o falso.`)
  })
}

/** Request body that must be a JSON object. A missing body is reported, never thrown. */
export function bodyObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape, { error: 'El cuerpo de la petición debe ser un objeto JSON.' })
}

/** Query string object (`req.query`). */
export function queryObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape, { error: 'Los parámetros de la petición no son válidos.' })
}

export const emailField = z
  .string({ error: issue => (describeType(issue.input) ? 'Falta el campo «correo electrónico».' : 'El campo «correo electrónico» debe ser un texto.') })
  .trim()
  .min(1, 'El campo «correo electrónico» no puede estar vacío.')
  .max(254, 'El campo «correo electrónico» no puede superar 254 caracteres.')
  .pipe(z.email('El correo electrónico no es válido.'))
  .transform(value => normalizeEmail(value))

/** Password rules live in lib/password.ts (validatePassword); this only adapts them. */
export const newPasswordField = z
  .string({ error: issue => (describeType(issue.input) ? 'Falta el campo «contraseña».' : 'El campo «contraseña» debe ser un texto.') })
  .superRefine((value, ctx) => {
    const message = validatePassword(value)
    if (message) ctx.addIssue({ code: 'custom', message })
  })
