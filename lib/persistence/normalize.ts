/**
 * Normalizers for values whose JavaScript type depends on the database driver.
 *
 * - `COUNT(*)`, `SUM(int)` and other `bigint`/`numeric` aggregates arrive as
 *   numbers from SQLite but as numeric text from `pg` (it never converts
 *   `bigint` to avoid losing precision).
 * - Boolean expressions (`EXISTS (...)`) arrive as `0`/`1` from SQLite and as
 *   `true`/`false` from PostgreSQL.
 *
 * Repositories apply these right after the query so every layer above (and the
 * API) sees one type regardless of the backend.
 */

/** A driver aggregate as a number: `'7'` -> 7, `null`/`undefined` -> 0. */
export function toCount(value: unknown): number {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Like `toCount`, but keeps `null` (e.g. `MIN`/`MAX` over no rows). */
export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** A driver boolean as a boolean: `1`, `'1'`, `'t'`, `'true'` and `true` are true. */
export function toBoolean(value: unknown): boolean {
  if (typeof value === 'string') return ['1', 't', 'true'].includes(value.trim().toLowerCase())
  return Boolean(value)
}

/** Returns a copy of `row` with the listed columns converted to numbers (`toCount`). */
export function withCounts<T extends object, K extends keyof T>(row: T, columns: readonly K[]): T & Record<K, number> {
  const result = { ...row } as T & Record<K, number>
  for (const column of columns) {
    if (column in row) result[column] = toCount(row[column]) as never
  }
  return result
}
