import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Pool } from 'pg'
import { Kysely, PostgresDialect } from 'kysely'
import { FileMigrationProvider, Migrator } from 'kysely/migration'

/**
 * Formal, versioned Postgres migration runner (Kysely `Migrator` +
 * `FileMigrationProvider`).
 *
 * This is the deployment path for real Postgres instances (Supabase). It is
 * intentionally separate from `PostgresDb.migrate()` in `lib/persistence/postgresDb.ts`,
 * which stays as the fast, idempotent `CREATE TABLE IF NOT EXISTS` bootstrap
 * used by the test suite to spin up ephemeral schemas. See backlog.md
 * "Migraciones formales de PostgreSQL" for the full rationale.
 *
 * Usage:
 *   tsx scripts/migrate.ts up      # migrateToLatest()
 *   tsx scripts/migrate.ts down    # roll back exactly one migration
 *   tsx scripts/migrate.ts status  # list executed vs pending migrations
 *
 * Requires DATABASE_URL. Never falls back to SQLite.
 */

const MIGRATION_FOLDER = path.join(__dirname, '..', 'migrations')

function createMigrator(): { db: Kysely<any>; migrator: Migrator } {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('Error: DATABASE_URL no esta definida. Este comando solo opera contra PostgreSQL real.')
    console.error('Ejemplo: direnv exec . npx tsx scripts/migrate.ts status')
    process.exit(1)
  }

  // Supabase requires SSL; a local Postgres (e.g. docker-compose.test.yml,
  // used for the isolated test database) does not support it at all, so
  // detect a local host and skip SSL only in that case.
  const isLocalHost = /^postgresql:\/\/[^/]*@?(localhost|127\.0\.0\.1)[:/]/.test(connectionString)

  const pool = new Pool({
    connectionString,
    max: 5,
    ssl: isLocalHost ? false : { rejectUnauthorized: false }
  })

  const db = new Kysely<any>({
    dialect: new PostgresDialect({ pool })
  })

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: MIGRATION_FOLDER
    })
  })

  return { db, migrator }
}

async function runUp() {
  const { db, migrator } = createMigrator()
  const { error, results } = await migrator.migrateToLatest()

  results?.forEach((result) => {
    if (result.status === 'Success') {
      console.log(`[OK] migracion "${result.migrationName}" ejecutada correctamente`)
    } else if (result.status === 'Error') {
      console.error(`[ERROR] fallo la migracion "${result.migrationName}"`)
    } else {
      console.log(`[SKIPPED] "${result.migrationName}" no se ejecuto (fallo una anterior)`)
    }
  })

  await db.destroy()

  if (error) {
    console.error('migrateToLatest fallo:', error)
    process.exit(1)
  }

  if (!results || results.length === 0) {
    console.log('No hay migraciones pendientes.')
  }
}

async function runDown() {
  const { db, migrator } = createMigrator()
  const { error, results } = await migrator.migrateDown()

  results?.forEach((result) => {
    if (result.status === 'Success') {
      console.log(`[OK] revertida la migracion "${result.migrationName}"`)
    } else if (result.status === 'Error') {
      console.error(`[ERROR] fallo al revertir "${result.migrationName}"`)
    } else {
      console.log(`[SKIPPED] "${result.migrationName}" no se reviritio`)
    }
  })

  await db.destroy()

  if (error) {
    console.error('migrateDown fallo:', error)
    process.exit(1)
  }

  if (!results || results.length === 0) {
    console.log('No hay migraciones para revertir.')
  }
}

async function runStatus() {
  const { db, migrator } = createMigrator()
  const migrations = await migrator.getMigrations()

  for (const migration of migrations) {
    const state = migration.executedAt ? `ejecutada (${migration.executedAt.toISOString()})` : 'pendiente'
    console.log(`${migration.name}: ${state}`)
  }

  await db.destroy()

  const pending = migrations.filter((m) => !m.executedAt)
  if (pending.length === 0) {
    console.log('\nTodas las migraciones estan al dia.')
  } else {
    console.log(`\n${pending.length} migracion(es) pendiente(s).`)
  }
}

async function main() {
  const command = process.argv[2]

  switch (command) {
    case 'up':
      await runUp()
      break
    case 'down':
      await runDown()
      break
    case 'status':
      await runStatus()
      break
    default:
      console.error('Uso: tsx scripts/migrate.ts <up|down|status>')
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
