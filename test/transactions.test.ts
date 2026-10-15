import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { openSqliteDb } from '../lib/persistence'
import type { DatabaseClient } from '../lib/persistence'
import { NestedTransactionError, TransactionClosedError } from '../lib/persistence/transaction'
import { validateRoadmapImport } from '../lib/domains/content/import'
import { persistRoadmapImport } from '../lib/domains/content/repositories/importRepository'

let db: DatabaseClient

beforeEach(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-transactions-'))
  db = await openSqliteDb(path.join(tmp, 'test.db'))
})

afterEach(async () => {
  await db.close()
})

async function count(table: string) {
  return Number((await db.get(`SELECT COUNT(*) AS count FROM ${table}`)).count)
}

describe('SQLite transaction()', () => {
  it('commits what the callback wrote and returns its result', async () => {
    const result = await db.transaction(async tx => {
      await tx.run('INSERT INTO roadmaps (title) VALUES (?)', ['A'])
      return tx.get('SELECT title FROM roadmaps')
    })

    expect(result).toEqual({ title: 'A' })
    expect(await count('roadmaps')).toBe(1)
  })

  it('rolls back on failure and rethrows the original error', async () => {
    const failure = new Error('boom')

    await expect(db.transaction(async tx => {
      await tx.run('INSERT INTO roadmaps (title) VALUES (?)', ['A'])
      throw failure
    })).rejects.toBe(failure)

    expect(await count('roadmaps')).toBe(0)
    // The connection is usable again afterwards.
    await db.transaction(tx => tx.run('INSERT INTO roadmaps (title) VALUES (?)', ['B']))
    expect(await count('roadmaps')).toBe(1)
  })

  it('rejects nested transactions and use of the tx client after it finished', async () => {
    let leaked: DatabaseClient | undefined

    await expect(db.transaction(async tx => {
      leaked = tx
      await tx.run('INSERT INTO roadmaps (title) VALUES (?)', ['A'])
      await tx.transaction(async () => undefined)
    })).rejects.toBeInstanceOf(NestedTransactionError)

    expect(await count('roadmaps')).toBe(0)
    await expect(leaked!.get('SELECT 1')).rejects.toBeInstanceOf(TransactionClosedError)
  })

  it('serializes concurrent transactions on the same client', async () => {
    const order: string[] = []
    const run = (name: string, fail = false) => db.transaction(async tx => {
      order.push(`${name}:start`)
      await tx.run('INSERT INTO roadmaps (title) VALUES (?)', [name])
      await new Promise(resolve => setTimeout(resolve, 5))
      order.push(`${name}:end`)
      if (fail) throw new Error(name)
    })

    const results = await Promise.allSettled([run('a'), run('b', true), run('c')])

    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected', 'fulfilled'])
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end'])
    expect((await db.all('SELECT title FROM roadmaps ORDER BY title')).map((row: any) => row.title)).toEqual(['a', 'c'])
  })
})

describe('SQLite: atomic use cases roll back on mid-failure', () => {
  it('a roadmap import that fails on a module leaves no roadmap, topics or category behind', async () => {
    const roadmap = validateRoadmapImport({
      title: 'Plataforma',
      category: 'Cloud',
      topics: ['AWS'],
      modules: [{ position: 0, title: 'Fundamentos' }]
    }).roadmap!
    await db.exec(`
      CREATE TRIGGER fail_module_insert BEFORE INSERT ON modules
      BEGIN SELECT RAISE(ABORT, 'module insert failed'); END
    `)

    await expect(persistRoadmapImport(db, roadmap, 'create')).rejects.toThrow('module insert failed')

    expect(await count('roadmaps')).toBe(0)
    expect(await count('roadmap_categories')).toBe(0)
    expect(await count('topics')).toBe(0)
    expect(await count('roadmap_topics')).toBe(0)
  })
})
