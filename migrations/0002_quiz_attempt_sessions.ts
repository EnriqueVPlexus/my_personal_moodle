import { Kysely } from 'kysely'

/**
 * Quiz attempt sessions: the server remembers which questions (and in which
 * option order) it served to a learner, so grading is authoritative even when
 * each attempt shows a random subset of the module's question bank.
 *
 * `questions` is a full JSON snapshot (answers included), so editing or
 * re-importing the bank never breaks grading of an open session. Rows are
 * ephemeral (24 h TTL) and are not copied by `scripts/migrate-sqlite-to-postgres.ts`.
 *
 * Mirrored in `POSTGRES_SCHEMA` (lib/persistence/postgresDb.ts), see 0001's header.
 */

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('quiz_attempt_sessions')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'integer', (col) =>
      col.notNull().references('users.id').onDelete('cascade')
    )
    .addColumn('module_id', 'integer', (col) =>
      col.notNull().references('modules.id').onDelete('cascade')
    )
    .addColumn('questions', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('submitted_at', 'timestamptz')
    .execute()

  await db.schema
    .createIndex('idx_quiz_attempt_sessions_user_module')
    .ifNotExists()
    .on('quiz_attempt_sessions')
    .columns(['user_id', 'module_id'])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('quiz_attempt_sessions').ifExists().execute()
}
