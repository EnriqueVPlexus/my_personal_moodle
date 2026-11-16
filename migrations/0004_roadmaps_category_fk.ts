import { Kysely, sql } from 'kysely'

/**
 * Adds the missing foreign key constraint on `roadmaps.category_id` referencing
 * `roadmap_categories(id) ON DELETE SET NULL`, matching SQLite's schema
 * (`lib/persistence/sqliteSchema.ts`) and `POSTGRES_SCHEMA` (`lib/persistence/postgresDb.ts`).
 *
 * Idempotent: clears any orphaned `category_id` values first and checks
 * `pg_constraint` in the active schema before adding `roadmaps_category_id_fkey`.
 */

const CONSTRAINT_NAME = 'roadmaps_category_id_fkey'

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE roadmaps
    SET category_id = NULL
    WHERE category_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM roadmap_categories WHERE roadmap_categories.id = roadmaps.category_id
      )
  `.execute(db)

  const existing = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint c
      INNER JOIN pg_class t ON t.oid = c.conrelid
      INNER JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = current_schema()
        AND t.relname = 'roadmaps'
        AND c.conname = ${CONSTRAINT_NAME}
    ) AS exists
  `.execute(db)

  if (!existing.rows[0]?.exists) {
    await db.schema
      .alterTable('roadmaps')
      .addForeignKeyConstraint(
        CONSTRAINT_NAME,
        ['category_id'],
        'roadmap_categories',
        ['id']
      )
      .onDelete('set null')
      .execute()
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE roadmaps DROP CONSTRAINT IF EXISTS ${sql.raw(CONSTRAINT_NAME)}
  `.execute(db)
}
