import { open } from 'sqlite'
import path from 'path'
import fs from 'fs'
import { PostgresDb } from './postgresDb'
import type { DatabaseClient } from './database'
import { migrateSqliteSchema } from './sqliteSchema'
import { seedRoadmaps } from './bootstrap/roadmapSeed'
import { seedInitialAdmin } from './bootstrap/adminSeed'

const DATA_DIR = path.resolve(process.cwd(), 'data')
const DB_FILE = path.join(DATA_DIR, 'dev.db')
let initialized = false

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

export async function openSqliteDb(filename = DB_FILE): Promise<DatabaseClient> {
  const directory = path.dirname(filename)
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true })
  const { default: sqlite3 } = await loadSqlite3()
  const db = await open({
    filename,
    driver: sqlite3.Database
  })
  await db.exec('PRAGMA foreign_keys = ON')
  await migrateSqliteSchema(db)
  return Object.assign(db, { backend: 'sqlite' as const }) as unknown as DatabaseClient
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
  if (process.env.DATABASE_URL) {
    const db = getPostgresDb(process.env.DATABASE_URL)
    if (!initialized) {
      await db.migrate()
      await seedRoadmaps(db)
      await seedInitialAdmin(db)
      initialized = true
    }
    return db
  }

  const db = await openSqliteDb()

  if (!initialized) {
    await seedRoadmaps(db)
    await seedInitialAdmin(db)
    initialized = true
  }

  return db
}
