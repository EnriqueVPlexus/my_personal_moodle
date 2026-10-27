import type { DatabaseClient } from '../database'

// Arbitrary, stable keys for Postgres advisory locks (bigint space is shared
// by the whole database, so keep them distinctive).
export const CATALOG_SEED_LOCK = 7266301001
export const ADMIN_SEED_LOCK = 7266301002

/**
 * Runs `work` in a transaction that is exclusive across connections AND
 * processes for the given bootstrap step.
 *
 * - Postgres: `pg_advisory_xact_lock` is taken first and released
 *   automatically on COMMIT/ROLLBACK, so a waiter only proceeds after the
 *   winner is done and can then re-check its own "already seeded?" condition.
 * - SQLite: `transaction()` is BEGIN IMMEDIATE, which already serializes
 *   writers across connections (busy_timeout makes them wait).
 */
export async function withBootstrapLock<T>(
  db: DatabaseClient,
  key: number,
  work: (tx: DatabaseClient) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    if (tx.backend === 'postgres') {
      await tx.get(`SELECT pg_advisory_xact_lock(${Math.trunc(key)})`)
    }
    return work(tx)
  })
}
