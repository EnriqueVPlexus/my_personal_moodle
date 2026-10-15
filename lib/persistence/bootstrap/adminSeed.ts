import { hashPassword, normalizeEmail, validatePassword } from '../../password'

export async function seedInitialAdmin(db: any) {
  const email = normalizeEmail(process.env.ADMIN_EMAIL || '')
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) return

  const validationError = validatePassword(password)
  if (validationError) {
    console.warn(`ADMIN_PASSWORD ignored: ${validationError}`)
    return
  }

  const existing = await db.get('SELECT id FROM users WHERE email = ?', [email])
  if (existing) {
    await db.run(
      'UPDATE users SET role = ?, is_active = 1, updated_at = ? WHERE id = ?',
      ['admin', new Date().toISOString(), existing.id]
    )
    return
  }

  await db.run(
    `INSERT INTO users (email, name, role, password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [
      email,
      'Admin',
      'admin',
      await hashPassword(password),
      new Date().toISOString(),
      new Date().toISOString()
    ]
  )
}

