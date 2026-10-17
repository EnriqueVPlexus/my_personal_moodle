import type { DatabaseClient } from '../../../persistence/database'
import type { RateLimitRepository, RateLimitRow } from '../ports'

/**
 * Rate limit state lives in the shared database (SQLite locally, PostgreSQL in
 * production) so the limit holds across server instances and serverless
 * invocations, which an in-memory store cannot do.
 */
export function createRateLimitRepository(db: DatabaseClient): RateLimitRepository {
  return {
    find(key) {
      return db.get<RateLimitRow | undefined>(
        'SELECT attempt_count, reset_at FROM rate_limits WHERE rate_key = ?',
        [key]
      )
    },

    async update(key, attemptCount, resetAt) {
      await db.run('UPDATE rate_limits SET attempt_count = ?, reset_at = ? WHERE rate_key = ?', [
        attemptCount,
        resetAt,
        key
      ])
    },

    async insert(key, attemptCount, resetAt) {
      await db.run('INSERT INTO rate_limits (rate_key, attempt_count, reset_at) VALUES (?, ?, ?)', [
        key,
        attemptCount,
        resetAt
      ])
    },

    async remove(key) {
      await db.run('DELETE FROM rate_limits WHERE rate_key = ?', [key])
    }
  }
}
