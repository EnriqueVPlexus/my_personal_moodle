import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import path from 'path'
import fs from 'fs'

const DATA_DIR = path.resolve(process.cwd(), 'data')
const DB_FILE = path.join(DATA_DIR, 'dev.db')

export async function openDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR)
  const db = await open({
    filename: DB_FILE,
    driver: sqlite3.Database
  })

  await migrate(db)
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
}
