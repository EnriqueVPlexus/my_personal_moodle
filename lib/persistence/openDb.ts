import { open } from 'sqlite'
import path from 'path'
import fs from 'fs'
import { PostgresDb } from './postgresDb'
import type { DatabaseClient } from './database'
import { migrateSqliteSchema } from './sqliteSchema'
import { NestedTransactionError, TransactionClosedError, createMutex, runInTransaction } from './transaction'
import { seedRoadmaps } from './bootstrap/roadmapSeed'
import { seedInitialAdmin } from './bootstrap/adminSeed'

const DATA_DIR = path.resolve(process.cwd(), 'data')
const DB_FILE = path.join(DATA_DIR, 'dev.db')
// Single in-flight bootstrap (migrate + seeds) per process. Concurrent first
// requests all await the same promise instead of each running the bootstrap
// (the old `initialized` flag was only set AFTER it finished, so every request
// arriving meanwhile seeded again). Cleared on failure so a later call retries.
// Cross-process safety is handled by the advisory lock in bootstrapLock.ts.
let initPromise: Promise<void> | null = null

function ensureInitialized(db: DatabaseClient): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      if (db instanceof PostgresDb) await db.migrate()
      await seedRoadmaps(db)
      await seedInitialAdmin(db)
    })().catch((error) => {
      initPromise = null
      throw error
    })
  }
  return initPromise
}

// Imported lazily and cached in a single module-level promise: sqlite3 is an
// optionalDependency (native binding, only needed for local/dev SQLite) so a
// production install with DATABASE_URL set must not fail or crash just
// because this module got imported. Caching the promise (instead of calling
// import() again on every openSqliteDb() invocation) also avoids issuing
// several concurrent first-time import() calls for the same native addon,
// which can race under concurrent callers.
// TS types `sqlite3` as a CJS `export =` module with no `.default`, but the
// dynamic import() runtime interop (Next.js/esbuild/Node) does wrap it with
// one, matching how the static `import sqlite3 from 'sqlite3'` used to work.
let sqlite3ModulePromise: Promise<{ default: typeof import('sqlite3') }> | null = null
function loadSqlite3() {
  if (!sqlite3ModulePromise) {
    sqlite3ModulePromise = import('sqlite3') as unknown as Promise<{ default: typeof import('sqlite3') }>
  }
  return sqlite3ModulePromise
}

const runSchemaMigration = createMutex()

export async function openSqliteDb(filename = DB_FILE): Promise<DatabaseClient> {
  const directory = path.dirname(filename)
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true })
  const { default: sqlite3 } = await loadSqlite3()
  const db = await open({
    filename,
    driver: sqlite3.Database
  })
  await db.exec('PRAGMA foreign_keys = ON')
  // openSqliteDb() opens a NEW connection per call, so a transaction on one
  // connection can overlap with writes from another (other requests). Wait up
  // to 5s for the lock instead of failing at once with SQLITE_BUSY. WAL is
  // deliberately not enabled: it would add -wal/-shm files and change the
  // on-disk behaviour of the existing local/temp-dir setup.
  await db.exec('PRAGMA busy_timeout = 5000')
  // Concurrent first openSqliteDb() calls would otherwise run the (check-then-
  // ALTER) schema migration in parallel and fail with "duplicate column".
  await runSchemaMigration(() => migrateSqliteSchema(db))
  return withSqliteTransactions(db)
}

export async function openSqliteDbReadOnly(filename: string) {
  const { default: sqlite3 } = await loadSqlite3()
  return open({
    filename,
    driver: sqlite3.Database,
    mode: sqlite3.OPEN_READONLY
  })
}

// Each openDb()/openSqliteDb() call owns its own connection, so on that client a transaction is plain
// BEGIN IMMEDIATE / COMMIT / ROLLBACK on it. The tx client delegates to the
// same connection; a mutex keeps concurrent transaction() calls on THAT client
// from interleaving (other connections are handled by busy_timeout) (a second BEGIN would fail, and non-transactional writes
// issued meanwhile would silently join the open transaction).
function withSqliteTransactions(db: Awaited<ReturnType<typeof open>>): DatabaseClient {
  const runExclusive = createMutex()

  const client = Object.assign(db, {
    backend: 'sqlite' as const,
    transaction<T>(work: (tx: DatabaseClient) => Promise<T>): Promise<T> {
      return runExclusive(() => {
        let finished = false
        const guard = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
          (...args: A): Promise<R> => finished ? Promise.reject(new TransactionClosedError()) : fn(...args)

        const tx = {
          backend: 'sqlite' as const,
          get: guard((sql: string, params?: unknown[]) => db.get(sql, params ?? [])),
          all: guard((sql: string, params?: unknown[]) => db.all(sql, params ?? [])),
          run: guard(async (sql: string, params?: unknown[]) => {
            const result = await db.run(sql, params ?? [])
            return { changes: result.changes, lastID: result.lastID }
          }),
          exec: guard((sql: string) => db.exec(sql)),
          transaction: () => Promise.reject(new NestedTransactionError()),
          close: () => Promise.reject(new Error('Cannot close the database from inside a transaction.'))
        } as unknown as DatabaseClient

        return runInTransaction(
          () => db.exec('BEGIN IMMEDIATE'),
          () => db.exec('COMMIT'),
          () => db.exec('ROLLBACK'),
          () => work(tx)
        ).finally(() => { finished = true })
      })
    }
  })
  return client as unknown as DatabaseClient
}

// Cached by connection string, mirroring the sqlite3ModulePromise pattern
// above: openDb() used to build a brand-new PostgresDb (and therefore a
// brand-new pg Pool with its own `max` connections) on every single call,
// which meant every per-request pages/api handler spun up its own pool
// instead of sharing one process-wide pool. Keying by connection string
// (rather than a single bare variable) is cheap insurance in case it ever
// changed at runtime (e.g. across tests) - in practice there's only one
// DATABASE_URL per process.
const postgresDbInstances = new Map<string, PostgresDb>()
function getPostgresDb(connectionString: string): PostgresDb {
  let db = postgresDbInstances.get(connectionString)
  if (!db) {
    db = new PostgresDb(connectionString)
    postgresDbInstances.set(connectionString, db)
  }
  return db
}

export async function openDb(): Promise<DatabaseClient> {
  const db = process.env.DATABASE_URL
    ? getPostgresDb(process.env.DATABASE_URL)
    : await openSqliteDb()

  await ensureInitialized(db)
  return db
}
