export type DatabaseRunResult = {
  changes?: number
  lastID?: number
}

export interface DatabaseClient {
  readonly backend: 'sqlite' | 'postgres'
  get<T = any>(sql: string, params?: unknown[]): Promise<T>
  all<T = any>(sql: string, params?: unknown[]): Promise<T[]>
  run(sql: string, params?: unknown[]): Promise<DatabaseRunResult>
  exec(sql: string): Promise<unknown>
  /**
   * Runs `work` atomically: every statement issued through the `tx` client it
   * receives (raw SQL and, on Postgres, Kysely queries obtained from it) goes
   * through one connection. Resolves with the result of `work` after COMMIT;
   * if `work` throws, rolls back and rethrows the original error.
   *
   * Nesting is not supported: calling `transaction()` on a `tx` client throws
   * NestedTransactionError (see lib/persistence/transaction.ts). Do not use
   * the outer client for statements that must be part of the transaction.
   */
  transaction<T>(work: (tx: DatabaseClient) => Promise<T>): Promise<T>
  close(): Promise<unknown>
}
