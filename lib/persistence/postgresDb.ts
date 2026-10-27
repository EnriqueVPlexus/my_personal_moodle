import { Pool, PoolClient, QueryResult } from 'pg'
import type { DatabaseClient, DatabaseRunResult } from './database'
import { resolvePgSsl } from './pgSsl'
import { NestedTransactionError, TransactionClosedError, runInTransaction } from './transaction'

const ID_TABLES = new Set([
  'roadmaps', 'modules', 'lessons', 'users', 'sessions', 'audit_logs',
  'roadmap_categories', 'topics', 'user_lesson_progress', 'user_roadmap_progress',
  'user_quiz_attempts', 'user_module_evidences'
])

const POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS roadmaps (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  duration TEXT,
  objectives TEXT,
  methodology TEXT,
  evaluation_weights TEXT,
  category_id INTEGER,
  duration_weeks_min REAL,
  duration_weeks_max REAL,
  version TEXT NOT NULL DEFAULT 'v1.0.0',
  published_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS modules (
  id SERIAL PRIMARY KEY,
  roadmap_id INTEGER NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  position INTEGER,
  title TEXT NOT NULL,
  duration TEXT,
  duration_weeks_min REAL,
  duration_weeks_max REAL,
  level TEXT,
  objective TEXT,
  contents TEXT,
  importance TEXT,
  official_resources TEXT,
  support_videos TEXT,
  practical_activity TEXT,
  deliverable_evidence TEXT,
  evaluation TEXT,
  quiz_bank TEXT,
  quiz_pass_percentage INTEGER,
  quiz_max_attempts INTEGER,
  quiz_cooldown_minutes INTEGER
);
CREATE TABLE IF NOT EXISTS lessons (
  id SERIAL PRIMARY KEY,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  password_hash TEXT NOT NULL,
  can_view_all_roadmaps INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE TABLE IF NOT EXISTS user_roadmap_access (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  roadmap_id INTEGER NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, roadmap_id)
);
CREATE INDEX IF NOT EXISTS idx_user_roadmap_access_roadmap_id ON user_roadmap_access(roadmap_id);
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE TABLE IF NOT EXISTS roadmap_categories (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS topics (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roadmap_topics (
  roadmap_id INTEGER NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (roadmap_id, topic_id)
);
CREATE INDEX IF NOT EXISTS idx_roadmap_topics_topic_id ON roadmap_topics(topic_id);
CREATE TABLE IF NOT EXISTS user_lesson_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_user_lesson_progress_user_id ON user_lesson_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_lesson_progress_lesson_id ON user_lesson_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_user_lesson_progress_last_activity ON user_lesson_progress(last_activity_at);
CREATE TABLE IF NOT EXISTS user_roadmap_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  roadmap_id INTEGER NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  current_module_id INTEGER REFERENCES modules(id) ON DELETE SET NULL,
  current_lesson_id INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  completed_lessons_count INTEGER NOT NULL DEFAULT 0,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, roadmap_id)
);
CREATE INDEX IF NOT EXISTS idx_user_roadmap_progress_user_id ON user_roadmap_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roadmap_progress_roadmap_id ON user_roadmap_progress(roadmap_id);
CREATE INDEX IF NOT EXISTS idx_user_roadmap_progress_last_activity ON user_roadmap_progress(last_activity_at);
CREATE TABLE IF NOT EXISTS user_quiz_attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  roadmap_id INTEGER REFERENCES roadmaps(id) ON DELETE CASCADE,
  module_id INTEGER REFERENCES modules(id) ON DELETE CASCADE,
  quiz_scope TEXT NOT NULL DEFAULT 'module',
  score REAL,
  max_score REAL,
  answers TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_user_id ON user_quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_roadmap_id ON user_quiz_attempts(roadmap_id);
CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_module_id ON user_quiz_attempts(module_id);
CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_submitted_at ON user_quiz_attempts(submitted_at);
CREATE TABLE IF NOT EXISTS quiz_attempt_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  questions TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_quiz_attempt_sessions_user_module ON quiz_attempt_sessions(user_id, module_id);
CREATE TABLE IF NOT EXISTS user_module_evidences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,
  url TEXT,
  note TEXT,
  review_status TEXT NOT NULL DEFAULT 'pendiente',
  admin_comment TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, module_id)
);
CREATE INDEX IF NOT EXISTS idx_user_module_evidences_user_id ON user_module_evidences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_module_evidences_module_id ON user_module_evidences(module_id);
CREATE INDEX IF NOT EXISTS idx_user_module_evidences_review_status ON user_module_evidences(review_status);
CREATE INDEX IF NOT EXISTS idx_user_module_evidences_updated_at ON user_module_evidences(updated_at);
CREATE INDEX IF NOT EXISTS idx_roadmaps_category_id ON roadmaps(category_id);
CREATE INDEX IF NOT EXISTS idx_roadmaps_duration_weeks ON roadmaps(duration_weeks_min, duration_weeks_max);
CREATE INDEX IF NOT EXISTS idx_modules_level ON modules(level);
CREATE INDEX IF NOT EXISTS idx_modules_roadmap_id ON modules(roadmap_id);
CREATE INDEX IF NOT EXISTS idx_modules_duration_weeks ON modules(duration_weeks_min, duration_weeks_max);
CREATE TABLE IF NOT EXISTS rate_limits (
  rate_key TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);
`

function translateSql(sql: string, params: unknown[] = []) {
  let translated = sql
    .replace(/datetime\(([^)]+)\)/gi, '$1')
    .replace(/\s+COLLATE\s+NOCASE/gi, '')
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO')

  if (/INSERT\s+INTO/i.test(translated) && /INSERT\s+OR\s+IGNORE/i.test(sql)) {
    translated = `${translated.trim().replace(/;$/, '')} ON CONFLICT DO NOTHING`
  }

  let index = 0
  translated = translated.replace(/\?/g, () => `$${++index}`)
  if (index !== params.length) {
    throw new Error(`SQL parameter count mismatch: expected ${index}, received ${params.length}`)
  }
  return translated
}

type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>

const TRANSACTION_CONTROL = /^\s*(BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION|END)\b/i

async function runQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  target: Queryable,
  sql: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return (target as Pool).query<T>(translateSql(sql, params), params)
}

async function runRun(target: Queryable, sql: string, params: unknown[] = []): Promise<DatabaseRunResult> {
  const isInsert = /^\s*INSERT\s+INTO\s+([a-z_]+)/i.exec(sql)
  const table = isInsert?.[1]?.toLowerCase()
  const needsId = Boolean(table && ID_TABLES.has(table) && !/\bRETURNING\b/i.test(sql))
  const query = needsId ? `${sql.trim().replace(/;$/, '')} RETURNING id` : sql
  const result = await runQuery(target, query, params)
  return {
    changes: result.rowCount || 0,
    lastID: needsId ? Number(result.rows[0]?.id) : undefined
  }
}

function assertNotTransactionControl(sql: string) {
  if (TRANSACTION_CONTROL.test(sql)) {
    throw new Error('Transaction control statements are not allowed through exec(): use db.transaction().')
  }
}

/**
 * Client handed to `PostgresDb.transaction()` callbacks. Everything, raw SQL
 * and Kysely, runs on the one checked-out PoolClient.
 *
 * `getPool()` returns a facade that looks like a Pool to Kysely's
 * PostgresDialect but always yields that same client (release is a no-op), so
 * repositories that build Kysely with `getQueryDatabase(db.getPool())` join
 * the transaction without knowing it. Kysely caches one instance per facade
 * (WeakMap), so it is garbage collected with the transaction.
 */
export class PostgresTransaction implements DatabaseClient {
  readonly backend = 'postgres' as const
  private finished = false
  private readonly poolFacade: Pool

  constructor(private readonly client: PoolClient) {
    const guarded = {
      query: (...args: unknown[]) => {
        this.assertOpen()
        return (client.query as (...a: unknown[]) => unknown)(...args)
      },
      release: () => undefined
    }
    this.poolFacade = {
      connect: async () => {
        this.assertOpen()
        return guarded
      },
      query: guarded.query,
      end: async () => undefined,
      on: () => undefined
    } as unknown as Pool
  }

  /** @internal Called by PostgresDb once COMMIT/ROLLBACK has run. */
  markFinished() {
    this.finished = true
  }

  private assertOpen() {
    if (this.finished) throw new TransactionClosedError()
  }

  getPool(): Pool {
    return this.poolFacade
  }

  async get<T = any>(sql: string, params?: unknown[]): Promise<T> {
    this.assertOpen()
    return (await runQuery(this.client, sql, params)).rows[0] as T
  }

  async all<T = any>(sql: string, params?: unknown[]): Promise<T[]> {
    this.assertOpen()
    return (await runQuery(this.client, sql, params)).rows as T[]
  }

  async run(sql: string, params: unknown[] = []): Promise<DatabaseRunResult> {
    this.assertOpen()
    return runRun(this.client, sql, params)
  }

  async exec(sql: string) {
    this.assertOpen()
    assertNotTransactionControl(sql)
    await runQuery(this.client, sql)
  }

  transaction<T>(): Promise<T> {
    return Promise.reject(new NestedTransactionError())
  }

  async close(): Promise<never> {
    throw new Error('Cannot close the database from inside a transaction.')
  }
}

export class PostgresDb implements DatabaseClient {
  readonly backend = 'postgres' as const
  private readonly pool: Pool

  constructor(connectionString: string) {
    // SSL decision (Supabase needs it; local/Docker Postgres may not): see
    // resolvePgSsl() and the DATABASE_SSL env override.
    this.pool = new Pool({
      connectionString,
      max: 5,
      // Recycle idle clients instead of holding them open indefinitely
      // against Supabase's connection cap, and fail fast (rather than the
      // pg default of hanging forever) when the pool is saturated.
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: resolvePgSsl(connectionString)
    })
    // node-postgres requires listening for 'error' on the pool: an idle
    // client can emit it (e.g. the server terminating the connection), and
    // an unhandled 'error' event crashes the whole Node process otherwise.
    // https://node-postgres.com/apis/pool#error
    this.pool.on('error', (err) => {
      console.error('Unexpected Postgres pool error', err)
    })
  }

  async migrate() {
    await this.pool.query(POSTGRES_SCHEMA)
  }

  getPool(): Pool {
    return this.pool
  }

  async get<T = any>(sql: string, params?: unknown[]): Promise<T> {
    return (await runQuery(this.pool, sql, params)).rows[0] as T
  }

  async all<T = any>(sql: string, params?: unknown[]): Promise<T[]> {
    return (await runQuery(this.pool, sql, params)).rows as T[]
  }

  async run(sql: string, params: unknown[] = []): Promise<DatabaseRunResult> {
    return runRun(this.pool, sql, params)
  }

  async exec(sql: string) {
    assertNotTransactionControl(sql)
    await runQuery(this.pool, sql)
  }

  /**
   * Checks out ONE client from the pool for the whole transaction and always
   * releases it (discarding it if ROLLBACK itself failed, since its state is
   * unknown). Concurrent transactions use different clients.
   */
  async transaction<T>(work: (tx: DatabaseClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    const tx = new PostgresTransaction(client)
    let discard = false
    try {
      return await runInTransaction(
        () => client.query('BEGIN'),
        () => client.query('COMMIT'),
        async () => {
          try {
            await client.query('ROLLBACK')
          } catch (error) {
            discard = true
            throw error
          }
        },
        () => work(tx)
      )
    } finally {
      tx.markFinished()
      client.release(discard)
    }
  }

  async close() {
    await this.pool.end()
  }
}
