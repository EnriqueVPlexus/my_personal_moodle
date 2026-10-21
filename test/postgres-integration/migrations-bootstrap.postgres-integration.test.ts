import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { Pool, Client } from 'pg'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { FileMigrationProvider, Migrator } from 'kysely/migration'

/**
 * Proves backlog.md's "Migraciones formales de PostgreSQL" acceptance
 * criterion: "Una base PostgreSQL vacia puede levantarse solo con las
 * migraciones".
 *
 * This runs against the real, shared Supabase instance (see backlog.md's own
 * admission that there is no isolated test database yet), so it must NOT
 * touch the `public` schema that `PostgresDb.migrate()` and the rest of the
 * test suite already populate. Instead it creates a throwaway schema
 * (namespace), points a fresh Kysely connection at it via `search_path`, runs
 * `migrateToLatest()` against that truly empty schema, asserts every
 * expected table was created, runs it again to prove idempotency (nothing
 * pending, no errors), and drops the schema in `afterAll` unconditionally.
 *
 * Requires DATABASE_URL (or TEST_DATABASE_URL, which takes precedence and
 * should point at the isolated local Docker Postgres from
 * docker-compose.test.yml - see test/postgres-integration/README.md).
 * Skipped entirely otherwise so `vitest run` stays green without one.
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeIfPostgres = DATABASE_URL ? describe : describe.skip

const MIGRATION_FOLDER = path.join(__dirname, '..', '..', 'migrations')

const EXPECTED_TABLES = [
  'roadmap_categories',
  'topics',
  'roadmaps',
  'modules',
  'lessons',
  'users',
  'sessions',
  'user_roadmap_access',
  'audit_logs',
  'roadmap_topics',
  'user_lesson_progress',
  'user_roadmap_progress',
  'user_quiz_attempts',
  'quiz_attempt_sessions',
  'user_module_evidences',
  'rate_limits'
].sort()

describeIfPostgres('migrateToLatest bootstraps an empty schema (real postgres, throwaway schema)', () => {
  const schemaName = `migration_bootstrap_test_${Date.now()}_${Math.random().toString(36).slice(2)}`
  let adminPool: Pool
  let scopedPool: Pool
  let db: Kysely<any>

  // Supabase requires SSL; the isolated local Docker Postgres
  // (docker-compose.test.yml) does not support it at all.
  const isLocalHost = /^postgresql:\/\/[^/]*@?(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL as string)

  beforeAll(async () => {
    adminPool = new Pool({
      connectionString: DATABASE_URL,
      max: 2,
      ssl: isLocalHost ? false : { rejectUnauthorized: false }
    })
    await adminPool.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)

    // A dedicated pool whose connections default to the throwaway schema's
    // search_path, so every statement the migrator runs (including the
    // internal kysely_migration/kysely_migration_lock tables) lands there
    // instead of `public`. Startup-packet `options` (`-c search_path=...`)
    // is not reliable through Supabase's pgbouncer pooler, so instead every
    // physical connection runs `SET search_path` as part of its `connect()`
    // (awaited, so it always completes before the connection is handed back
    // to the pool for use).
    class ScopedSchemaClient extends Client {
      async connect(...args: unknown[]): Promise<void> {
        // @ts-expect-error - pg's connect() overload typing doesn't cover the callback form we don't use here
        await super.connect(...args)
        await this.query(`SET search_path TO "${schemaName}"`)
      }
    }

    scopedPool = new Pool({
      connectionString: DATABASE_URL,
      max: 2,
      ssl: isLocalHost ? false : { rejectUnauthorized: false },
      Client: ScopedSchemaClient as unknown as typeof Client
    })

    db = new Kysely<any>({
      dialect: new PostgresDialect({ pool: scopedPool })
    })
  })

  afterAll(async () => {
    await db?.destroy()
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
    await adminPool.end()
  })

  function createMigrator() {
    return new Migrator({
      db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: MIGRATION_FOLDER
      }),
      // Without this, Kysely's Postgres introspector checks for
      // `kysely_migration`/`kysely_migration_lock` across ALL accessible
      // schemas (it has no schema filter), so it would find the ones
      // already created by earlier `migrate:up` runs against `public` and
      // wrongly skip creating them here, in the throwaway schema.
      migrationTableSchema: schemaName
    })
  }

  it('creates every expected table from scratch', async () => {
    const migrator = createMigrator()
    const { error, results } = await migrator.migrateToLatest()

    expect(error).toBeUndefined()
    expect(results?.every((r) => r.status === 'Success')).toBe(true)

    const tables = await sql<{ table_name: string }>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = ${schemaName} AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('kysely_migration', 'kysely_migration_lock')
    `.execute(db)

    const tableNames = tables.rows.map((r) => r.table_name).sort()
    expect(tableNames).toEqual(EXPECTED_TABLES)
  })

  it('is idempotent: a second run has nothing pending and does not error', async () => {
    const migrator = createMigrator()
    const { error, results } = await migrator.migrateToLatest()

    expect(error).toBeUndefined()
    expect(results).toEqual([])

    const migrations = await migrator.getMigrations()
    expect(migrations.every((m) => m.executedAt)).toBe(true)
  })
})
