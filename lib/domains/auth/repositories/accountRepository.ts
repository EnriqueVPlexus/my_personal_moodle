import type { DatabaseClient } from '../../../persistence/database'
import type { AccountRepository, LoginUserRow } from '../ports'

export function createAccountRepository(db: DatabaseClient): AccountRepository {
  return {
    findActiveLoginUser(email) {
      return db.get<LoginUserRow | undefined>(
        'SELECT id, email, name, role, password_hash FROM users WHERE email = ? AND is_active = 1',
        [email]
      )
    },

    findReadSettings(userId) {
      return db.get<{ can_view_all_roadmaps: number } | undefined>(
        'SELECT can_view_all_roadmaps FROM users WHERE id = ? AND is_active = 1',
        [userId]
      )
    },

    async listAccessibleRoadmapIds(userId) {
      const rows = await db.all<{ roadmap_id: unknown }>(
        'SELECT roadmap_id FROM user_roadmap_access WHERE user_id = ? ORDER BY roadmap_id',
        [userId]
      )
      return rows.map(row => Number(row.roadmap_id)).filter(id => Number.isInteger(id))
    },

    async countUsers() {
      const row = await db.get('SELECT COUNT(*) AS count FROM users')
      return Number(row.count)
    },

    async insertAdmin({ email, name, passwordHash, nowIso }) {
      const result = await db.run(
        `INSERT INTO users (email, name, role, password_hash, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
        [email, name, 'admin', passwordHash, nowIso, nowIso]
      )
      return result.lastID
    }
  }
}
