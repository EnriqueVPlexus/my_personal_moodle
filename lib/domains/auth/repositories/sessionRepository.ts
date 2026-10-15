import type { DatabaseClient } from '../../../persistence/database'
import type { SessionRepository, SessionUserRow } from '../ports'

export function createSessionRepository(db: DatabaseClient): SessionRepository {
  return {
    async deleteExpired(nowIso) {
      await db.run('DELETE FROM sessions WHERE expires_at <= ?', [nowIso])
    },

    async insert({ userId, tokenHash, expiresAt, nowIso }) {
      await db.run(
        'INSERT INTO sessions (user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
        [userId, tokenHash, expiresAt, nowIso, nowIso]
      )
    },

    async deleteByTokenHash(tokenHash) {
      await db.run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash])
    },

    findActiveUser(tokenHash, nowIso) {
      return db.get<SessionUserRow | undefined>(
        `SELECT users.id, users.email, users.name, users.role
         FROM sessions
         INNER JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ?
           AND sessions.expires_at > ?
           AND users.is_active = 1`,
        [tokenHash, nowIso]
      )
    },

    async touch(tokenHash, nowIso) {
      await db.run('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?', [nowIso, tokenHash])
    }
  }
}
