/**
 * Port for atomic use cases. A service that must write to several tables
 * (or several repositories) asks for a `UnitOfWork` and runs the writes inside
 * `run`: the repositories it receives are bound to one transaction, which
 * commits when `work` resolves and rolls back (rethrowing the original error)
 * when it throws.
 *
 * Domains only see this interface; `lib/container.ts` implements it on top of
 * `DatabaseClient.transaction()` so no domain imports `lib/persistence`.
 *
 * Rules: do reads that decide *whether* to write before or inside `run`,
 * never use the outer repositories for statements that must be atomic, and do
 * not nest `run` calls (nested transactions are rejected).
 */
export interface UnitOfWork<Repositories> {
  run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T>
}
