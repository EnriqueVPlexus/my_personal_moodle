import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { Pool, Client } from 'pg'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { FileMigrationProvider, Migrator } from 'kysely/migration'

/**
 * Migration 0003 against a real Postgres, in a throwaway schema: migrate to
 * 0002, plant the damage left by the seeding race (identical roadmaps, a
 * roadmap with duplicated modules, the legacy "IA para DevOps"), plus
 * duplicates that DO have user data, then run 0003 (twice, for idempotency).
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeIfPostgres = DATABASE_URL ? describe : describe.skip
const MIGRATION_FOLDER = path.join(__dirname, '..', '..', 'migrations')

describeIfPostgres('migration 0003: dedupe seeded catalog (real postgres, throwaway schema)', () => {
  const schemaName = `dedupe_test_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const isLocalHost = /^postgresql:\/\/[^/]*@?(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL as string)
  let adminPool: Pool
  let scopedPool: Pool
  let db: Kysely<any>

  const migrator = () => new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: MIGRATION_FOLDER }),
    migrationTableSchema: schemaName
  })

  async function insertRoadmap(title: string, description = 'same'): Promise<number> {
    const { rows } = await sql<{ id: number }>`
      INSERT INTO roadmaps (title, description, version) VALUES (${title}, ${description}, 'v1.0.0') RETURNING id
    `.execute(db)
    return rows[0].id
  }

  async function insertModule(roadmapId: number, position: number, title = `Module ${position}`): Promise<number> {
    const { rows } = await sql<{ id: number }>`
      INSERT INTO modules (roadmap_id, position, title, objective) VALUES (${roadmapId}, ${position}, ${title}, 'obj') RETURNING id
    `.execute(db)
    return rows[0].id
  }

  async function insertUser(email: string): Promise<number> {
    const { rows } = await sql<{ id: number }>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `.execute(db)
    return rows[0].id
  }

  const ids = async (query: ReturnType<typeof sql>) => ((await query.execute(db)).rows as Array<{ id: number }>).map(r => r.id)

  let keptRoadmap: number
  let dupRoadmaps: number[] = []
  let moduleDupRoadmap: number
  let moduleDups: number[] = []
  let moduleDupKept: number
  let legacyFree: number
  let legacyUsed: number
  let protectedDup: number
  let protectedKeep: number
  let protectedModuleDup: number
  let protectedModuleKeep: number
  let interleavedKeep: number
  let interleavedClone: number

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: DATABASE_URL, max: 2, ssl: isLocalHost ? false : { rejectUnauthorized: false } })
    await adminPool.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)

    class ScopedSchemaClient extends Client {
      async connect(...args: unknown[]): Promise<void> {
        // @ts-expect-error - pg's connect() overload typing doesn't cover the callback form we don't use here
        await super.connect(...args)
        await this.query(`SET search_path TO "${schemaName}"`)
      }
    }
    scopedPool = new Pool({
      connectionString: DATABASE_URL,
      max: 2,
      ssl: isLocalHost ? false : { rejectUnauthorized: false },
      Client: ScopedSchemaClient as unknown as typeof Client
    })
    db = new Kysely<any>({ dialect: new PostgresDialect({ pool: scopedPool }) })

    const upTo2 = await migrator().migrateTo('0002_quiz_attempt_sessions')
    expect(upTo2.error).toBeUndefined()

    // 1. Three identical roadmaps (race clones), each with 2 modules.
    keptRoadmap = await insertRoadmap('Roadmap A')
    await insertModule(keptRoadmap, 0)
    await insertModule(keptRoadmap, 1)
    for (let i = 0; i < 2; i++) {
      const id = await insertRoadmap('Roadmap A')
      await insertModule(id, 0)
      await insertModule(id, 1)
      dupRoadmaps.push(id)
    }

    // 2. A roadmap with its modules duplicated inside it.
    moduleDupRoadmap = await insertRoadmap('Roadmap B')
    moduleDupKept = await insertModule(moduleDupRoadmap, 0)
    await insertModule(moduleDupRoadmap, 1)
    moduleDups = [await insertModule(moduleDupRoadmap, 0), await insertModule(moduleDupRoadmap, 1)]

    // 2b. Race clone that ALSO has duplicated modules: equal to its twin only
    // once the in-roadmap duplicates are collapsed.
    interleavedKeep = await insertRoadmap('Roadmap E')
    await insertModule(interleavedKeep, 0)
    await insertModule(interleavedKeep, 1)
    interleavedClone = await insertRoadmap('Roadmap E')
    await insertModule(interleavedClone, 0)
    await insertModule(interleavedClone, 0)
    await insertModule(interleavedClone, 1)
    await insertModule(interleavedClone, 1)

    // 3. Legacy roadmaps: one free, one with a learner's progress.
    legacyFree = await insertRoadmap('IA para DevOps', 'legacy-free')
    await insertModule(legacyFree, 0)
    legacyUsed = await insertRoadmap('IA para DevOps', 'legacy-used')
    await insertModule(legacyUsed, 0)
    const user = await insertUser('learner@example.com')
    await sql`INSERT INTO user_roadmap_progress (user_id, roadmap_id) VALUES (${user}, ${legacyUsed})`.execute(db)

    // 4. Duplicate roadmap WITH user data (must survive) ...
    protectedKeep = await insertRoadmap('Roadmap C')
    await insertModule(protectedKeep, 0)
    protectedDup = await insertRoadmap('Roadmap C')
    await insertModule(protectedDup, 0)
    await sql`INSERT INTO user_roadmap_progress (user_id, roadmap_id) VALUES (${user}, ${protectedDup})`.execute(db)

    // ... and a duplicate module WITH a quiz attempt (must survive).
    const protectedRoadmap = await insertRoadmap('Roadmap D')
    protectedModuleKeep = await insertModule(protectedRoadmap, 0)
    protectedModuleDup = await insertModule(protectedRoadmap, 0)
    await sql`
      INSERT INTO user_quiz_attempts (user_id, roadmap_id, module_id) VALUES (${user}, ${protectedRoadmap}, ${protectedModuleDup})
    `.execute(db)
  })

  afterAll(async () => {
    await db?.destroy()
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
    await adminPool.end()
  })

  async function snapshot() {
    return {
      roadmaps: await ids(sql`SELECT id FROM roadmaps ORDER BY id`),
      modules: await ids(sql`SELECT id FROM modules ORDER BY id`)
    }
  }

  it('removes only unreferenced duplicates and the unreferenced legacy roadmap', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { error } = await migrator().migrateToLatest()
    expect(error).toBeUndefined()

    const after = await snapshot()

    // identical roadmaps: lowest id kept, clones removed (with their modules)
    expect(after.roadmaps).toContain(keptRoadmap)
    for (const id of dupRoadmaps) expect(after.roadmaps).not.toContain(id)
    const keptModules = await ids(sql`SELECT id FROM modules WHERE roadmap_id = ${keptRoadmap}`)
    expect(keptModules).toHaveLength(2)

    // duplicated modules inside one roadmap
    expect(after.modules).toContain(moduleDupKept)
    for (const id of moduleDups) expect(after.modules).not.toContain(id)
    expect(await ids(sql`SELECT id FROM modules WHERE roadmap_id = ${moduleDupRoadmap}`)).toHaveLength(2)

    // clone with duplicated modules collapses into its twin
    expect(after.roadmaps).toContain(interleavedKeep)
    expect(after.roadmaps).not.toContain(interleavedClone)

    // legacy roadmap: free one gone, the one with progress kept
    expect(after.roadmaps).not.toContain(legacyFree)
    expect(after.roadmaps).toContain(legacyUsed)

    // duplicates carrying user data are kept
    expect(after.roadmaps).toContain(protectedKeep)
    expect(after.roadmaps).toContain(protectedDup)
    expect(after.modules).toContain(protectedModuleKeep)
    expect(after.modules).toContain(protectedModuleDup)

    // user data untouched
    expect(await ids(sql`SELECT id FROM user_roadmap_progress`)).toHaveLength(2)
    expect(await ids(sql`SELECT id FROM user_quiz_attempts`)).toHaveLength(1)

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`Roadmap ${protectedDup}`))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`Module ${protectedModuleDup}`))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`Legacy roadmap ${legacyUsed}`))
    warn.mockRestore()
  })

  it('is idempotent: re-running the cleanup changes nothing', async () => {
    const before = await snapshot()
    const migration = await import('../../migrations/0003_dedupe_seeded_catalog')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await migration.up(db)
    await migration.up(db)
    expect(await snapshot()).toEqual(before)
    vi.restoreAllMocks()

    const second = await migrator().migrateToLatest()
    expect(second.error).toBeUndefined()
    expect(second.results).toEqual([])
  })
})
