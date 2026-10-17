import type { DatabaseClient } from './database'

/**
 * Nesting policy: transactions are flat. A transaction client refuses to open
 * another one instead of silently joining it (an inner failure swallowed by
 * the caller would otherwise commit partial work) or using savepoints (extra
 * semantics nobody needs yet). Compose use cases by passing the `tx` client
 * down, not by calling `transaction()` again.
 */
export class NestedTransactionError extends Error {
  constructor() {
    super('Nested transactions are not supported: reuse the tx client you already have.')
    this.name = 'NestedTransactionError'
  }
}

export class TransactionClosedError extends Error {
  constructor() {
    super('The transaction has already finished: do not use its client after the callback returns.')
    this.name = 'TransactionClosedError'
  }
}

/** Serializes callers so two transactions never interleave on one connection. */
export function createMutex() {
  let tail: Promise<unknown> = Promise.resolve()
  return function runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task)
    tail = result.catch(() => undefined)
    return result
  }
}

/**
 * Runs BEGIN / work / COMMIT on `conn`, rolling back on failure. The original
 * error always wins: a failing ROLLBACK is logged, never thrown over it.
 */
export async function runInTransaction<T>(
  begin: () => Promise<unknown>,
  commit: () => Promise<unknown>,
  rollback: () => Promise<unknown>,
  work: () => Promise<T>
): Promise<T> {
  await begin()
  try {
    const result = await work()
    await commit()
    return result
  } catch (error) {
    try {
      await rollback()
    } catch (rollbackError) {
      console.error('Transaction rollback failed', rollbackError)
    }
    throw error
  }
}

export type TransactionWork<T> = (tx: DatabaseClient) => Promise<T>
