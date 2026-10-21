import { DEFAULT_ROADMAP_VERSION } from '../domains/content/version'
import { parseDurationWeeks } from '../domains/content/metadata'

/**
 * Idempotent SQLite schema bootstrap (CREATE TABLE IF NOT EXISTS + ensureColumn).
 * Postgres uses PostgresDb.migrate() / migrations/ instead.
 */
export async function migrateSqliteSchema(db: any) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS roadmaps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roadmap_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      password_hash TEXT NOT NULL,
      can_view_all_roadmaps INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS user_roadmap_access (
      user_id INTEGER NOT NULL,
      roadmap_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, roadmap_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_roadmap_access_roadmap_id ON user_roadmap_access(roadmap_id);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      actor_email TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);

    CREATE TABLE IF NOT EXISTS roadmap_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_lesson_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL,
      started_at TEXT,
      last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      time_spent_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
      UNIQUE (user_id, lesson_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_lesson_progress_user_id ON user_lesson_progress(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_lesson_progress_lesson_id ON user_lesson_progress(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_user_lesson_progress_last_activity ON user_lesson_progress(last_activity_at);

    CREATE TABLE IF NOT EXISTS user_roadmap_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      roadmap_id INTEGER NOT NULL,
      current_module_id INTEGER,
      current_lesson_id INTEGER,
      started_at TEXT,
      last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      completed_lessons_count INTEGER NOT NULL DEFAULT 0,
      time_spent_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE,
      FOREIGN KEY (current_module_id) REFERENCES modules(id) ON DELETE SET NULL,
      FOREIGN KEY (current_lesson_id) REFERENCES lessons(id) ON DELETE SET NULL,
      UNIQUE (user_id, roadmap_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_roadmap_progress_user_id ON user_roadmap_progress(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_roadmap_progress_roadmap_id ON user_roadmap_progress(roadmap_id);
    CREATE INDEX IF NOT EXISTS idx_user_roadmap_progress_last_activity ON user_roadmap_progress(last_activity_at);

    CREATE TABLE IF NOT EXISTS user_quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      roadmap_id INTEGER,
      module_id INTEGER,
      quiz_scope TEXT NOT NULL DEFAULT 'module',
      score REAL,
      max_score REAL,
      answers TEXT,
      submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE,
      FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_user_id ON user_quiz_attempts(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_roadmap_id ON user_quiz_attempts(roadmap_id);
    CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_module_id ON user_quiz_attempts(module_id);
    CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_submitted_at ON user_quiz_attempts(submitted_at);

    CREATE TABLE IF NOT EXISTS quiz_attempt_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      module_id INTEGER NOT NULL,
      questions TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      submitted_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_quiz_attempt_sessions_user_module ON quiz_attempt_sessions(user_id, module_id);

    CREATE TABLE IF NOT EXISTS user_module_evidences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      module_id INTEGER NOT NULL,
      evidence_type TEXT NOT NULL,
      url TEXT,
      note TEXT,
      review_status TEXT NOT NULL DEFAULT 'pendiente',
      admin_comment TEXT,
      reviewed_at TEXT,
      reviewed_by_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (user_id, module_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_module_evidences_user_id ON user_module_evidences(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_module_evidences_module_id ON user_module_evidences(module_id);
    CREATE INDEX IF NOT EXISTS idx_user_module_evidences_review_status ON user_module_evidences(review_status);
    CREATE INDEX IF NOT EXISTS idx_user_module_evidences_updated_at ON user_module_evidences(updated_at);
  `)

  await ensureColumn(db, 'roadmaps', 'objectives', 'TEXT')
  await ensureColumn(db, 'roadmaps', 'duration', 'TEXT')
  await ensureColumn(db, 'roadmaps', 'methodology', 'TEXT')
  await ensureColumn(db, 'roadmaps', 'evaluation_weights', 'TEXT')
  await ensureColumn(db, 'roadmaps', 'category_id', 'INTEGER REFERENCES roadmap_categories(id) ON DELETE SET NULL')
  await ensureColumn(db, 'roadmaps', 'duration_weeks_min', 'REAL')
  await ensureColumn(db, 'roadmaps', 'duration_weeks_max', 'REAL')
  await ensureColumn(db, 'roadmaps', 'version', 'TEXT')
  await ensureColumn(db, 'roadmaps', 'published_at', 'TEXT')
  await db.run("UPDATE roadmaps SET version = ? WHERE version IS NULL OR version = ''", [DEFAULT_ROADMAP_VERSION])
  await db.run("UPDATE roadmaps SET published_at = CURRENT_TIMESTAMP WHERE published_at IS NULL OR published_at = ''")

  await ensureColumn(db, 'modules', 'position', 'INTEGER')
  await ensureColumn(db, 'modules', 'duration', 'TEXT')
  await ensureColumn(db, 'modules', 'objective', 'TEXT')
  await ensureColumn(db, 'modules', 'contents', 'TEXT')
  await ensureColumn(db, 'modules', 'importance', 'TEXT')
  await ensureColumn(db, 'modules', 'official_resources', 'TEXT')
  await ensureColumn(db, 'modules', 'support_videos', 'TEXT')
  await ensureColumn(db, 'modules', 'practical_activity', 'TEXT')
  await ensureColumn(db, 'modules', 'deliverable_evidence', 'TEXT')
  await ensureColumn(db, 'modules', 'evaluation', 'TEXT')
  await ensureColumn(db, 'modules', 'level', 'TEXT')
  await ensureColumn(db, 'modules', 'duration_weeks_min', 'REAL')
  await ensureColumn(db, 'modules', 'duration_weeks_max', 'REAL')
  // Fase 2: banco de preguntas explícito por módulo
  await ensureColumn(db, 'modules', 'quiz_bank', 'TEXT')
  // Fase 3: configuración de evaluación por módulo
  await ensureColumn(db, 'modules', 'quiz_pass_percentage', 'INTEGER')
  await ensureColumn(db, 'modules', 'quiz_max_attempts', 'INTEGER')
  await ensureColumn(db, 'modules', 'quiz_cooldown_minutes', 'INTEGER')

  await ensureColumn(db, 'user_module_evidences', 'review_status', "TEXT NOT NULL DEFAULT 'pendiente'")
  await ensureColumn(db, 'user_module_evidences', 'admin_comment', 'TEXT')
  await ensureColumn(db, 'user_module_evidences', 'reviewed_at', 'TEXT')
  await ensureColumn(db, 'user_module_evidences', 'reviewed_by_user_id', 'INTEGER REFERENCES users(id) ON DELETE SET NULL')

  await db.exec(`
    CREATE TABLE IF NOT EXISTS roadmap_topics (
      roadmap_id INTEGER NOT NULL,
      topic_id INTEGER NOT NULL,
      PRIMARY KEY (roadmap_id, topic_id),
      FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE,
      FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_roadmaps_category_id ON roadmaps(category_id);
    CREATE INDEX IF NOT EXISTS idx_roadmaps_duration_weeks ON roadmaps(duration_weeks_min, duration_weeks_max);
    CREATE INDEX IF NOT EXISTS idx_modules_level ON modules(level);
    CREATE INDEX IF NOT EXISTS idx_modules_roadmap_id ON modules(roadmap_id);
    CREATE INDEX IF NOT EXISTS idx_modules_duration_weeks ON modules(duration_weeks_min, duration_weeks_max);
    CREATE INDEX IF NOT EXISTS idx_roadmap_topics_topic_id ON roadmap_topics(topic_id);

    CREATE TABLE IF NOT EXISTS rate_limits (
      rate_key TEXT PRIMARY KEY,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      reset_at TEXT NOT NULL
    );
  `)

  await ensureColumn(db, 'users', 'is_active', 'INTEGER NOT NULL DEFAULT 1')
  await ensureColumn(db, 'users', 'can_view_all_roadmaps', 'INTEGER NOT NULL DEFAULT 1')

  const modulesWithoutComparableDuration = await db.all(
    `SELECT id, duration FROM modules
     WHERE duration IS NOT NULL AND duration_weeks_min IS NULL AND duration_weeks_max IS NULL`
  )
  for (const moduleRow of modulesWithoutComparableDuration) {
    const duration = parseDurationWeeks(moduleRow.duration)
    if (duration.min !== null) {
      await db.run(
        'UPDATE modules SET duration_weeks_min = ?, duration_weeks_max = ? WHERE id = ?',
        [duration.min, duration.max, moduleRow.id]
      )
    }
  }

  const roadmapsWithoutComparableDuration = await db.all(
    `SELECT id, duration FROM roadmaps
     WHERE duration_weeks_min IS NULL AND duration_weeks_max IS NULL`
  )
  for (const roadmapRow of roadmapsWithoutComparableDuration) {
    const displayed = parseDurationWeeks(roadmapRow.duration)
    const moduleTotals = await db.get(
      `SELECT SUM(duration_weeks_min) AS min, SUM(duration_weeks_max) AS max
       FROM modules WHERE roadmap_id = ?`,
      [roadmapRow.id]
    )
    const min = displayed.min ?? moduleTotals?.min ?? null
    const max = displayed.max ?? moduleTotals?.max ?? null
    if (min !== null) {
      await db.run(
        'UPDATE roadmaps SET duration_weeks_min = ?, duration_weeks_max = ? WHERE id = ?',
        [min, max, roadmapRow.id]
      )
    }
  }
}

async function ensureColumn(db: any, table: string, column: string, definition: string) {
  const columns = await db.all(`PRAGMA table_info(${table})`)
  if (!columns.some((item: any) => item.name === column)) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}
