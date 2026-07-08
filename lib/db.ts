import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import path from 'path'
import fs from 'fs'
import awsRoadmapSeed from './awsRoadmapSeed.json'
import iaDevopsRoadmapSeed from './iaDevopsRoadmapSeed.json'
import { hashPassword, normalizeEmail, validatePassword } from './password'

const DATA_DIR = path.resolve(process.cwd(), 'data')
const DB_FILE = path.join(DATA_DIR, 'dev.db')
let initialized = false

type RoadmapSeed = {
  title: string
  duration?: string
  description: string
  objectives: string[]
  methodology: string[]
  evaluation_weights: Record<string, string>
  modules: {
    position: number
    title: string
    duration: string
    objective: string
    contents: string[]
    importance: string
    official_resources: { label: string; url?: string }[]
    support_videos: { label: string; url?: string }[]
    practical_activity: string[]
    deliverable_evidence: string[]
    evaluation: string
  }[]
}

const roadmapSeeds: RoadmapSeed[] = [
  awsRoadmapSeed,
  iaDevopsRoadmapSeed
]

export async function openDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR)
  const db = await open({
    filename: DB_FILE,
    driver: sqlite3.Database
  })
  await db.exec('PRAGMA foreign_keys = ON')

  if (!initialized) {
    await migrate(db)
    await seedRoadmaps(db)
    await seedInitialAdmin(db)
    initialized = true
  }

  return db
}

async function migrate(db: any) {
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
  `)

  await ensureColumn(db, 'roadmaps', 'objectives', 'TEXT')
  await ensureColumn(db, 'roadmaps', 'duration', 'TEXT')
  await ensureColumn(db, 'roadmaps', 'methodology', 'TEXT')
  await ensureColumn(db, 'roadmaps', 'evaluation_weights', 'TEXT')

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

  await ensureColumn(db, 'users', 'is_active', 'INTEGER NOT NULL DEFAULT 1')
}

async function ensureColumn(db: any, table: string, column: string, definition: string) {
  const columns = await db.all(`PRAGMA table_info(${table})`)
  if (!columns.some((item: any) => item.name === column)) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

async function seedRoadmaps(db: any) {
  for (const seed of roadmapSeeds) {
    await seedRoadmap(db, seed)
  }
}

async function seedRoadmap(db: any, seed: RoadmapSeed) {
  const existing = await db.get('SELECT id FROM roadmaps WHERE title = ?', [seed.title])
  let roadmapId = existing?.id

  if (roadmapId) {
    await db.run(
      `UPDATE roadmaps
       SET description = ?, duration = ?, objectives = ?, methodology = ?, evaluation_weights = ?
       WHERE id = ?`,
      [
        seed.description,
        seed.duration || null,
        JSON.stringify(seed.objectives),
        JSON.stringify(seed.methodology),
        JSON.stringify(seed.evaluation_weights),
        roadmapId
      ]
    )
  } else {
    const result = await db.run(
      `INSERT INTO roadmaps (title, description, duration, objectives, methodology, evaluation_weights)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        seed.title,
        seed.description,
        seed.duration || null,
        JSON.stringify(seed.objectives),
        JSON.stringify(seed.methodology),
        JSON.stringify(seed.evaluation_weights)
      ]
    )
    roadmapId = result.lastID
  }

  for (const moduleSeed of seed.modules) {
    const moduleRow = await db.get(
      'SELECT id FROM modules WHERE roadmap_id = ? AND (position = ? OR title = ?)',
      [roadmapId, moduleSeed.position, moduleSeed.title]
    )

    const values = [
      roadmapId,
      moduleSeed.position,
      moduleSeed.title,
      moduleSeed.duration,
      moduleSeed.objective,
      JSON.stringify(moduleSeed.contents),
      moduleSeed.importance,
      JSON.stringify(moduleSeed.official_resources),
      JSON.stringify(moduleSeed.support_videos),
      JSON.stringify(moduleSeed.practical_activity),
      JSON.stringify(moduleSeed.deliverable_evidence),
      moduleSeed.evaluation
    ]

    if (moduleRow?.id) {
      await db.run(
        `UPDATE modules
         SET roadmap_id = ?, position = ?, title = ?, duration = ?, objective = ?, contents = ?,
             importance = ?, official_resources = ?, support_videos = ?, practical_activity = ?,
             deliverable_evidence = ?, evaluation = ?
         WHERE id = ?`,
        [...values, moduleRow.id]
      )
    } else {
      await db.run(
        `INSERT INTO modules (
          roadmap_id, position, title, duration, objective, contents, importance,
          official_resources, support_videos, practical_activity, deliverable_evidence, evaluation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      )
    }
  }
}

async function seedInitialAdmin(db: any) {
  const email = normalizeEmail(process.env.ADMIN_EMAIL || '')
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) return

  const validationError = validatePassword(password)
  if (validationError) {
    console.warn(`ADMIN_PASSWORD ignored: ${validationError}`)
    return
  }

  const existing = await db.get('SELECT id FROM users WHERE email = ?', [email])
  if (existing) {
    await db.run(
      'UPDATE users SET role = ?, is_active = 1, updated_at = ? WHERE id = ?',
      ['admin', new Date().toISOString(), existing.id]
    )
    return
  }

  await db.run(
    `INSERT INTO users (email, name, role, password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [
      email,
      'Admin',
      'admin',
      await hashPassword(password),
      new Date().toISOString(),
      new Date().toISOString()
    ]
  )
}
