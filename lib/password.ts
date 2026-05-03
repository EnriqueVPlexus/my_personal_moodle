import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'crypto'
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 64

function passwordSecret(password: string) {
  return `${password}${process.env.AUTH_PASSWORD_PEPPER || ''}`
}

function scrypt(password: string, salt: string, keyLength: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function validatePassword(password: string) {
  if (password.length < 12) return 'La contraseña debe tener al menos 12 caracteres.'
  if (password.length > 256) return 'La contraseña es demasiado larga.'
  if (!/\S/.test(password)) return 'La contraseña no puede estar vacía.'
  return null
}

export async function hashPassword(password: string) {
  const validationError = validatePassword(password)
  if (validationError) throw new Error(validationError)

  const salt = randomBytes(16).toString('base64url')
  const hash = await scrypt(passwordSecret(password), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024
  }) as Buffer

  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt}:${hash.toString('base64url')}`
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, nValue, rValue, pValue, salt, storedHash] = passwordHash.split(':')
  if (algorithm !== 'scrypt' || !nValue || !rValue || !pValue || !salt || !storedHash) {
    return false
  }

  const hash = await scrypt(passwordSecret(password), salt, KEY_LENGTH, {
    N: Number(nValue),
    r: Number(rValue),
    p: Number(pValue),
    maxmem: 64 * 1024 * 1024
  }) as Buffer

  const stored = Buffer.from(storedHash, 'base64url')
  return stored.length === hash.length && timingSafeEqual(stored, hash)
}
