import { Kysely, sql } from 'kysely'

/**
 * Formal, versioned migration for the Postgres schema.
 *
 * This is a 1:1 translation of `POSTGRES_SCHEMA` in `lib/persistence/postgresDb.ts`,
 * expressed with Kysely's typed schema builder instead of a raw SQL blob.
 *
 * Every `createTable`/`createIndex` call uses `.ifNotExists()` so this
 * migration is safe to run against the real Supabase `public` schema, which
 * already has these tables created ad-hoc by `PostgresDb.migrate()` (see
 * backlog.md "Migraciones formales de PostgreSQL" for the rationale). Against
 * a genuinely empty schema it creates the full schema from scratch (see
 * `test/postgres-integration/migrations-bootstrap.postgres-integration.test.ts`).
 *
 * `lib/persistence/postgresDb.ts`'s `POSTGRES_SCHEMA` stays as the lightweight, idempotent
 * bootstrap used by the test suite; this migration is the formal path for
 * real deployments. Do not let the two drift: any future schema change must
 * be added here as a NEW migration (0002, 0003, ...), and should also be
 * reflected in `POSTGRES_SCHEMA` if the fast test bootstrap needs to keep
 * matching it.
 */

const CURRENT_TIMESTAMP = sql`CURRENT_TIMESTAMP`

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('roadmap_categories')
    .ifNotExists()
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('key', 'text', (col) => col.notNull().unique())
    .addColumn('label', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('topics')
    .ifNotExists()
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('key', 'text', (col) => col.notNull().unique())
    .addColumn('label', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('roadmaps')
    .ifNotExists()
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('duration', 'text')
    .addColumn('objectives', 'text')
    .addColumn('methodology', 'text')
    .addColumn('evaluation_weights', 'text')
    .addColumn('category_id', 'integer')
    .addColumn('duration_weeks_min', 'real')
    .addColumn('duration_weeks_max', 'real')
    .addColumn('version', 'text', (col) => col.notNull().defaultTo('v1.0.0'))
    .addColumn('published_at', 'timestamptz', (col) => col.notNull().defaultTo(CURRENT_TIMESTAMP))
    .execute()

  await db.schema
    .createTable('modules')
    .ifNotExists()
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('roadmap_id', 'integer', (col) =>
      col.notNull().references('roadmaps.id').onDelete('cascade')
    )
    .addColumn('position', 'integer')
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('duration', 'text')
    .addColumn('duration_weeks_min', 'real')
    .addColumn('duration_weeks_max', 'real')
    .addColumn('level', 'text')
    .addColumn('objective', 'text')
    .addColumn('contents', 'text')
    .addColumn('importance', 'text')
    .addColumn('official_resources', 'text')
    .addColumn('support_videos', 'text')
    .addColumn('practical_activity', 'text')
    .addColumn('deliverable_evidence', 'text')
    .addColumn('evaluation', 'text')
    .addColumn('quiz_bank', 'text')
    .addColumn('quiz_pass_percentage', 'integer')
    .addColumn('quiz_max_attempts', 'integer')
    .addColumn('quiz_cooldown_minutes', 'integer')
    .execute()

  await db.schema
    .createTable('lessons')
    .ifNotExists()
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('module_id', 'integer', (col) =>
      col.notNull().references('modules.id').onDelete('cascade')
    )
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('completed', 'integer', (col) => col.defaultTo(0))
    .execute()

  await db.schema
    .createTable('users')
    .ifNotExists()
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('email', 'text', (col) => col.notNull().unique())
    .addColumn('name', 'text')
    .addColumn('role', 'text', (col) => col.notNull().defaultTo('user'))
    .addColumn('password_hash', 'text', (col) => col.notNull())
    .addColumn('can_view_all_roadmaps', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('is_active', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(CURRENT_TIMESTAMP))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(CURRENT_TIMESTAMP))
    .execute()

  await db.schema
    .createTable('sessions')
    .ifNotExists()
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('user_id', 'integer', (col) =>
      col.notNull().references('users.id').onDelete('cascade')
    )
    .addColumn('token_hash', 'text', (col) => col.notNull().unique())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .addColumn('last_seen_at', 'timestamptz', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('idx_sessions_token_hash')
    .ifNotExists()
    .on('sessions')
    .column('token_hash')
    .execute()

  await db.schema
    .createIndex('idx_sessions_user_id')
    .ifNotExists()
    .on('sessions')
    .column('user_id')
    .execute()

  await db.schema
    .createTable('user_roadmap_access')
    .ifNotExists()
    .addColumn('user_id', 'integer', (col) =>
      col.notNull().references('users.id').onDelete('cascade')
    )
    .addColumn('roadmap_id', 'integer', (col) =>
      col.notNull().references('roadmaps.id').onDelete('cascade')
    )
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(CURRENT_TIMESTAMP))
    .addPrimaryKeyConstraint('user_roadmap_access_pkey', ['user_id', 'roadmap_id'])
    .execute()

  await db.schema
    .createIndex('idx_user_roadmap_access_roadmap_id')
    .ifNotExists()
    .on('user_roadmap_access')
    .column('roadmap_id')
    .execute()

  await db.schema
    .createTable('audit_logs')
    .ifNotExists()
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('actor_user_id', 'integer', (col) =>
      col.references('users.id').onDelete('set null')
    )
    .addColumn('actor_email', 'text')
    .addColumn('action', 'text', (col) => col.notNull())
    .addColumn('entity_type', 'text', (col) => col.notNull())
    .addColumn('entity_id', 'text')
    .addColumn('details', 'text')
    .addColumn('ip_address', 'text')
    .addColumn('user_agent', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('idx_audit_logs_created_at')
    .ifNotExists()
    .on('audit_logs')
    .column('created_at')
    .execute()

  await db.schema
    .createIndex('idx_audit_logs_actor_user_id')
    .ifNotExists()
    .on('audit_logs')
    .column('actor_user_id')
    .execute()

  await db.schema
    .createTable('roadmap_topics')
    .ifNotExists()
    .addColumn('roadmap_id', 'integer', (col) =>
      col.notNull().references('roadmaps.id').onDelete('cascade')
    )
    .addColumn('topic_id', 'integer', (col) =>
      col.notNull().references('topics.id').onDelete('cascade')
    )
    .addPrimaryKeyConstraint('roadmap_topics_pkey', ['roadmap_id', 'topic_id'])
    .execute()

  await db.schema
    .createIndex('idx_roadmap_topics_topic_id')
    .ifNotExists()
    .on('roadmap_topics')
    .column('topic_id')
    .execute()

  await db.schema
    .createTable('user_lesson_progress')
    .ifNotExists()
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('user_id', 'integer', (col) =>
      col.notNull().references('users.id').onDelete('cascade')
    )
    .addColumn('lesson_id', 'integer', (col) =>
      col.notNull().references('lessons.id').onDelete('cascade')
    )
    .addColumn('started_at', 'timestamptz')
    .addColumn('last_activity_at', 'timestamptz', (col) => col.notNull().defaultTo(CURRENT_TIMESTAMP))
    .addColumn('completed_at', 'timestamptz')
    .addColumn('time_spent_seconds', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(CURRENT_TIMESTAMP))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(CURRENT_TIMESTAMP))
    .addUniqueConstraint('user_lesson_progress_user_id_lesson_id_key', ['user_id', 'lesson_id'])
    .execute()

  await db.schema
    .createIndex('idx_user_lesson_progress_user_id')
    .ifNotExists()
    .on('user_lesson_progress')
    .column('user_id')
    .execute()

  await db.schema
    .createIndex('idx_user_lesson_progress_lesson_id')
    .ifNotExists()
    .on('user_lesson_progress')
    .column('lesson_id')
    .execute()

  await db.schema
    .createIndex('idx_user_lesson_progress_last_activity')
    .ifNotExists()
    .on('user_lesson_progress')
    .column('last_activity_at')
    .execute()

  await db.schema
    .createTable('user_roadmap_progress')
    .ifNotExists()
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('user_id', 'integer', (col) =>
      col.notNull().references('users.id').onDelete('cascade')
    )
    .addColumn('roadmap_id', 'integer', (col) =>
      col.notNull().references('roadmaps.id').onDelete('cascade')
    )
    .addColumn('current_module_id', 'integer', (col) =>
      col.references('modules.id').onDelete('set null')
    )
    .addColumn('current_lesson_id', 'integer', (col) =>
      col.references('lessons.id').onDelete('set null')
    )
    .addColumn('started_at', 'timestamptz')
    .addColumn('last_activity_at', 'timestamptz', (col) => col.notNull().defaultTo(CURRENT_TIMESTAMP))
    .addColumn('completed_at', 'timestamptz')
    .addColumn('completed_lessons_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('time_spent_seconds', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(CURRENT_TIMESTAMP))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(CURRENT_TIMESTAMP))
    .addUniqueConstraint('user_roadmap_progress_user_id_roadmap_id_key', ['user_id', 'roadmap_id'])
    .execute()

  await db.schema
    .createIndex('idx_user_roadmap_progress_user_id')
    .ifNotExists()
    .on('user_roadmap_progress')
    .column('user_id')
    .execute()

  await db.schema
    .createIndex('idx_user_roadmap_progress_roadmap_id')
    .ifNotExists()
    .on('user_roadmap_progress')
    .column('roadmap_id')
    .execute()

  await db.schema
    .createIndex('idx_user_roadmap_progress_last_activity')
    .ifNotExists()
    .on('user_roadmap_progress')
    .column('last_activity_at')
    .execute()

  await db.schema
    .createTable('user_quiz_attempts')
    .ifNotExists()
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('user_id', 'integer', (col) =>
      col.notNull().references('users.id').onDelete('cascade')
    )
    .addColumn('roadmap_id', 'integer', (col) => col.references('roadmaps.id').onDelete('cascade'))
    .addColumn('module_id', 'integer', (col) => col.references('modules.id').onDelete('cascade'))
    .addColumn('quiz_scope', 'text', (col) => col.notNull().defaultTo('module'))
    .addColumn('score', 'real')
    .addColumn('max_score', 'real')
    .addColumn('answers', 'text')
    .addColumn('submitted_at', 'timestamptz', (col) => col.notNull().defaultTo(CURRENT_TIMESTAMP))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(CURRENT_TIMESTAMP))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(CURRENT_TIMESTAMP))
    .execute()

  await db.schema
    .createIndex('idx_user_quiz_attempts_user_id')
    .ifNotExists()
    .on('user_quiz_attempts')
    .column('user_id')
    .execute()

  await db.schema
    .createIndex('idx_user_quiz_attempts_roadmap_id')
    .ifNotExists()
    .on('user_quiz_attempts')
    .column('roadmap_id')
    .execute()

  await db.schema
    .createIndex('idx_user_quiz_attempts_module_id')
    .ifNotExists()
    .on('user_quiz_attempts')
    .column('module_id')
    .execute()

  await db.schema
    .createIndex('idx_user_quiz_attempts_submitted_at')
    .ifNotExists()
    .on('user_quiz_attempts')
    .column('submitted_at')
    .execute()

  await db.schema
    .createTable('user_module_evidences')
    .ifNotExists()
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('user_id', 'integer', (col) =>
      col.notNull().references('users.id').onDelete('cascade')
    )
    .addColumn('module_id', 'integer', (col) =>
      col.notNull().references('modules.id').onDelete('cascade')
    )
    .addColumn('evidence_type', 'text', (col) => col.notNull())
    .addColumn('url', 'text')
    .addColumn('note', 'text')
    .addColumn('review_status', 'text', (col) => col.notNull().defaultTo('pendiente'))
    .addColumn('admin_comment', 'text')
    .addColumn('reviewed_at', 'timestamptz')
    .addColumn('reviewed_by_user_id', 'integer', (col) =>
      col.references('users.id').onDelete('set null')
    )
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(CURRENT_TIMESTAMP))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(CURRENT_TIMESTAMP))
    .addUniqueConstraint('user_module_evidences_user_id_module_id_key', ['user_id', 'module_id'])
    .execute()

  await db.schema
    .createIndex('idx_user_module_evidences_user_id')
    .ifNotExists()
    .on('user_module_evidences')
    .column('user_id')
    .execute()

  await db.schema
    .createIndex('idx_user_module_evidences_module_id')
    .ifNotExists()
    .on('user_module_evidences')
    .column('module_id')
    .execute()

  await db.schema
    .createIndex('idx_user_module_evidences_review_status')
    .ifNotExists()
    .on('user_module_evidences')
    .column('review_status')
    .execute()

  await db.schema
    .createIndex('idx_user_module_evidences_updated_at')
    .ifNotExists()
    .on('user_module_evidences')
    .column('updated_at')
    .execute()

  await db.schema
    .createIndex('idx_roadmaps_category_id')
    .ifNotExists()
    .on('roadmaps')
    .column('category_id')
    .execute()

  await db.schema
    .createIndex('idx_roadmaps_duration_weeks')
    .ifNotExists()
    .on('roadmaps')
    .columns(['duration_weeks_min', 'duration_weeks_max'])
    .execute()

  await db.schema
    .createIndex('idx_modules_level')
    .ifNotExists()
    .on('modules')
    .column('level')
    .execute()

  await db.schema
    .createIndex('idx_modules_roadmap_id')
    .ifNotExists()
    .on('modules')
    .column('roadmap_id')
    .execute()

  await db.schema
    .createIndex('idx_modules_duration_weeks')
    .ifNotExists()
    .on('modules')
    .columns(['duration_weeks_min', 'duration_weeks_max'])
    .execute()

  await db.schema
    .createTable('rate_limits')
    .ifNotExists()
    .addColumn('rate_key', 'text', (col) => col.primaryKey())
    .addColumn('attempt_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('reset_at', 'timestamptz', (col) => col.notNull())
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  // Reverse, FK-safe order: children before the parents they reference.
  await db.schema.dropTable('rate_limits').ifExists().execute()
  await db.schema.dropTable('user_module_evidences').ifExists().execute()
  await db.schema.dropTable('user_quiz_attempts').ifExists().execute()
  await db.schema.dropTable('user_roadmap_progress').ifExists().execute()
  await db.schema.dropTable('user_lesson_progress').ifExists().execute()
  await db.schema.dropTable('roadmap_topics').ifExists().execute()
  await db.schema.dropTable('audit_logs').ifExists().execute()
  await db.schema.dropTable('user_roadmap_access').ifExists().execute()
  await db.schema.dropTable('sessions').ifExists().execute()
  await db.schema.dropTable('users').ifExists().execute()
  await db.schema.dropTable('lessons').ifExists().execute()
  await db.schema.dropTable('modules').ifExists().execute()
  await db.schema.dropTable('roadmaps').ifExists().execute()
  await db.schema.dropTable('topics').ifExists().execute()
  await db.schema.dropTable('roadmap_categories').ifExists().execute()
}
