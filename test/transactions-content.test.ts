import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { openSqliteDb } from '../lib/persistence'
import type { DatabaseClient } from '../lib/persistence'
import { createServices } from '../lib/container'

let db: DatabaseClient

beforeEach(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-use-case-tx-'))
  db = await openSqliteDb(path.join(tmp, 'test.db'))
})

afterEach(async () => {
  await db.close()
})

async function count(table: string) {
  return Number((await db.get(`SELECT COUNT(*) AS count FROM ${table}`)).count)
}


describe('SQLite: content use cases are atomic', () => {
  it('creating a roadmap through the service rolls back the roadmap when its metadata fails', async () => {
    await db.exec(`
      CREATE TRIGGER fail_topic_insert BEFORE INSERT ON topics
      BEGIN SELECT RAISE(ABORT, 'topic insert failed'); END
    `)

    await expect(createServices(db).content.createRoadmap({
      title: 'Nueva', version: 'v1.0.0', publishedAt: new Date().toISOString(),
      durationWeeks: { min: null, max: null }, category: 'Cloud', topics: ['AWS']
    })).rejects.toThrow('topic insert failed')

    expect(await count('roadmaps')).toBe(0)
    expect(await count('roadmap_categories')).toBe(0)
  })
})
