# Postgres integration tests

These tests (`*.postgres-integration.test.ts`) run against a real Postgres
instance instead of a simulated `pg` pool. Each file gates on
`process.env.TEST_DATABASE_URL || process.env.DATABASE_URL` and is skipped
entirely (`describe.skip`) when neither is set, so `npm run test:unit` stays
green without any Postgres available.

## Isolated local Postgres (preferred)

`docker-compose.test.yml` at the repo root spins up an ephemeral, local-only
Postgres via Docker, so these tests never need to touch the shared Supabase
project:

```
npm run test:db:up     # starts postgres:16-alpine on localhost:55432 and
                        # runs the formal migrations (scripts/migrate.ts up)
                        # against it
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/app_test \
  npm run test:integration:run
npm run test:db:down    # stops the container and drops its (tmpfs) data
```

Or, as a single convenience command: `npm run test:integration` (brings the
container up, runs the suite, tears it down, and exits with the suite's
status).

These files run through `vitest.integration.config.ts`, which runs them one
file at a time (`fileParallelism: false`): every file calls
`PostgresDb.migrate()` against the same database, and parallel files
deadlock. The default `vitest.config.ts` excludes this folder and blanks
`DATABASE_URL`/`TEST_DATABASE_URL`, so `npm run test:unit` always runs on
SQLite even when `direnv` exports a real connection string.

The container declares no persistent volume (data lives on tmpfs), so it
always starts empty and is never a durable database — `test:db:down` (`down
-v`) removes it completely every time.

## Fallback: real Supabase

If `TEST_DATABASE_URL` is not set, these tests fall back to `DATABASE_URL`
(the same variable the app itself uses, loaded via `direnv` from
`.env.local`), i.e. the shared real Supabase instance:

```
direnv exec . npm run test:integration:run
```

This keeps working for anyone who has not set up Docker yet, but it exercises
a shared database rather than an isolated one — prefer `TEST_DATABASE_URL`
when possible.

The local connection string is
`postgresql://postgres:postgres@localhost:55432/app_test` (the default used by
the `test:db:*` scripts). See `backlog.md`'s "Tests de integracion contra PostgreSQL real" entry for the
full rationale.
