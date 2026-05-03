import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import path from 'path'
import fs from 'fs'
import awsRoadmapSeed from './awsRoadmapSeed.json'

const DATA_DIR = path.resolve(process.cwd(), 'data')
const DB_FILE = path.join(DATA_DIR, 'dev.db')
let initialized = false

export async function openDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR)
  const db = await open({
    filename: DB_FILE,
    driver: sqlite3.Database
  })

  if (!initialized) {
    await migrate(db)
    await seedAwsRoadmap(db)
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
  `)

  await ensureColumn(db, 'roadmaps', 'objectives', 'TEXT')
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
}

async function ensureColumn(db: any, table: string, column: string, definition: string) {
  const columns = await db.all(`PRAGMA table_info(${table})`)
  if (!columns.some((item: any) => item.name === column)) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

async function seedAwsRoadmap(db: any) {
  const seed = awsRoadmapSeed
  const existing = await db.get('SELECT id FROM roadmaps WHERE title = ?', [seed.title])
  let roadmapId = existing?.id

  if (roadmapId) {
    await db.run(
      `UPDATE roadmaps
       SET description = ?, objectives = ?, methodology = ?, evaluation_weights = ?
       WHERE id = ?`,
      [
        seed.description,
        JSON.stringify(seed.objectives),
        JSON.stringify(seed.methodology),
        JSON.stringify(seed.evaluation_weights),
        roadmapId
      ]
    )
  } else {
    const result = await db.run(
      `INSERT INTO roadmaps (title, description, objectives, methodology, evaluation_weights)
       VALUES (?, ?, ?, ?, ?)`,
      [
        seed.title,
        seed.description,
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
