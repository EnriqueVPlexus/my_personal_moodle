import { defineConfig } from 'vitest/config'

// Real-Postgres integration suite (test/postgres-integration/**). Kept apart
// from vitest.config.ts so unit runs never pick these up, and so the
// sequential-file requirement lives in config instead of a CLI flag.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/postgres-integration/**/*.postgres-integration.test.ts'],
    // Every file calls PostgresDb.migrate() (CREATE TABLE IF NOT EXISTS)
    // against the same database; running files in parallel deadlocks.
    fileParallelism: false
  }
})
