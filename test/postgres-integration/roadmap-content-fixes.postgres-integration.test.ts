import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { Pool, Client } from 'pg'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { FileMigrationProvider, Migrator } from 'kysely/migration'
import { buildSeedColumns, catalogSeeds } from '../../lib/persistence/bootstrap/roadmapSeed'

/**
 * migration 0005 against a real Postgres, in throwaway schemas: migrate to
 * 0004, plant a minimal PRE-fix catalog (the AWS roadmap with 11 modules and
 * the AI roadmap with the old "Vertex AI" module title, no DevOps roadmap),
 * add learner data, then run 0005 (and again, for idempotency).
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeIfPostgres = DATABASE_URL ? describe : describe.skip
const MIGRATION_FOLDER = path.join(__dirname, '..', '..', 'migrations')

const AWS_TITLE = 'Roadmap AWS gratuito para cantera junior DevOps'
const AI_TITLE = 'Roadmap IA para SRE/DevOps - Versión 2.0'
const NEW_AWS_MODULE = 'Cuenta AWS, Free Tier, seguridad inicial y control de costes'
const OLD_AI_MODULE = 'Plataformas cloud de IA: Azure OpenAI, AWS Bedrock y Google Vertex AI'

// Pre-fix AWS module titles, in their pre-fix positions 0..10.
const OLD_AWS_TITLES = [
  'Fundamentos cloud', 'Amazon EC2', 'Amazon S3', 'AWS IAM', 'Amazon VPC y red en AWS',
  'Amazon CloudWatch y observabilidad', 'AWS CLI', 'Terraform', 'Docker', 'GitHub Actions', 'Proyecto final'
]

// Pre-fix seed bank of "Amazon S3" (one question), as the old seed stored it.
const OLD_S3_BANK = JSON.stringify([{
  question: '¿Qué modelo de almacenamiento usa Amazon S3?',
  answer: 'Objetos',
  options: ['Objetos', 'Bloques locales', 'Cintas magnéticas'],
  explanation: 'S3 almacena datos como objetos dentro de buckets.'
}])
const CUSTOM_BANK = JSON.stringify([{ question: 'Admin question', answer: 'a', options: ['a', 'b'] }])

function createScoped(schemaName: string) {
  const isLocalHost = /^postgresql:\/\/[^/]*@?(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL as string)
  const ssl = isLocalHost ? false : { rejectUnauthorized: false }
  const adminPool = new Pool({ connectionString: DATABASE_URL, max: 2, ssl })

  class ScopedSchemaClient extends Client {
    async connect(...args: unknown[]): Promise<void> {
      // @ts-expect-error - pg's connect() overload typing doesn't cover the callback form we don't use here
      await super.connect(...args)
      await this.query(`SET search_path TO "${schemaName}"`)
    }
  }
  const scopedPool = new Pool({
    connectionString: DATABASE_URL,
    max: 2,
    ssl,
    Client: ScopedSchemaClient as unknown as typeof Client
  })
  const db = new Kysely<any>({ dialect: new PostgresDialect({ pool: scopedPool }) })
  const migrator = () => new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: MIGRATION_FOLDER }),
    migrationTableSchema: schemaName
  })

  return {
    db,
    migrator,
    async create() {
      await adminPool.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)
    },
    async destroy() {
      await db.destroy()
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
      await adminPool.end()
    }
  }
}

const suffix = () => `${Date.now()}_${Math.random().toString(36).slice(2)}`

describeIfPostgres('migration 0005: roadmap content fixes (real postgres, throwaway schema)', () => {
  const scoped = createScoped(`content_fix_test_${suffix()}`)
  const { db } = scoped

  let awsRoadmap: number
  let aiRoadmap: number
  let userId: number
  const oldModuleIds = new Map<string, number>()
  let aiVertexModule: number
  let aiOtherModule: number
  let sessionId: string

  async function insertRoadmap(title: string, description: string): Promise<number> {
    const { rows } = await sql<{ id: number }>`
      INSERT INTO roadmaps (title, description, objectives, duration_weeks_min, duration_weeks_max, version)
      VALUES (${title}, ${description}, '["old objective"]', 1, 2, 'v1.0.0') RETURNING id
    `.execute(db)
    return rows[0].id
  }

  async function insertModule(
    roadmapId: number, position: number, title: string, extra: { objective?: string; quizBank?: string | null } = {}
  ): Promise<number> {
    const { rows } = await sql<{ id: number }>`
      INSERT INTO modules (roadmap_id, position, title, objective, contents, quiz_bank)
      VALUES (${roadmapId}, ${position}, ${title}, ${extra.objective ?? 'old objective'}, '["old content"]', ${extra.quizBank ?? null})
      RETURNING id
    `.execute(db)
    return rows[0].id
  }

  async function moduleRows(roadmapId: number) {
    return (await sql<Record<string, unknown>>`SELECT * FROM modules WHERE roadmap_id = ${roadmapId} ORDER BY id`.execute(db)).rows
  }

  const seedFor = (title: string) => buildSeedColumns(catalogSeeds.find(seed => seed.title === title)!)

  beforeAll(async () => {
    await scoped.create()
    const upTo4 = await scoped.migrator().migrateTo('0004_roadmaps_category_fk')
    expect(upTo4.error).toBeUndefined()

    awsRoadmap = await insertRoadmap(AWS_TITLE, 'old description')
    for (const [position, title] of OLD_AWS_TITLES.entries()) {
      oldModuleIds.set(title, await insertModule(awsRoadmap, position, title, {
        // S3 keeps the untouched pre-fix bank, IAM carries an admin-customised
        // one, the rest have none. S3's objective is an admin edit.
        quizBank: title === 'Amazon S3' ? OLD_S3_BANK : title === 'AWS IAM' ? CUSTOM_BANK : null,
        objective: title === 'Amazon S3' ? 'Admin-edited objective' : undefined
      }))
    }

    aiRoadmap = await insertRoadmap(AI_TITLE, 'ai description')
    aiVertexModule = await insertModule(aiRoadmap, 5, OLD_AI_MODULE)
    aiOtherModule = await insertModule(aiRoadmap, 6, 'A module the fix does not touch', { objective: 'keep me' })

    const { rows } = await sql<{ id: number }>`
      INSERT INTO users (email, password_hash) VALUES ('learner@example.com', 'x') RETURNING id
    `.execute(db)
    userId = rows[0].id

    // Learner data on AWS modules: progress pointing at EC2, a quiz attempt on S3,
    // an open quiz session on EC2 (its questions are a full snapshot).
    await sql`
      INSERT INTO user_roadmap_progress (user_id, roadmap_id, current_module_id)
      VALUES (${userId}, ${awsRoadmap}, ${oldModuleIds.get('Amazon EC2')!})
    `.execute(db)
    await sql`
      INSERT INTO user_quiz_attempts (user_id, roadmap_id, module_id, score, max_score)
      VALUES (${userId}, ${awsRoadmap}, ${oldModuleIds.get('Amazon S3')!}, 1, 1)
    `.execute(db)
    sessionId = `session-${suffix()}`
    await sql`
      INSERT INTO quiz_attempt_sessions (id, user_id, module_id, questions, created_at, expires_at)
      VALUES (${sessionId}, ${userId}, ${oldModuleIds.get('Amazon EC2')!}, '[{"question":"snapshot"}]', now(), now() + interval '1 day')
    `.execute(db)
  })

  afterAll(async () => {
    await scoped.destroy()
  })

  async function snapshot() {
    return {
      roadmaps: (await sql`SELECT * FROM roadmaps ORDER BY id`.execute(db)).rows,
      modules: (await sql`SELECT * FROM modules ORDER BY id`.execute(db)).rows
    }
  }

  it('brings the pre-fix catalog up to the current seed, keeping ids and user data attached', async () => {
    const idsBefore = (await sql<{ id: number }>`SELECT id FROM modules ORDER BY id`.execute(db)).rows.map(r => r.id)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { error, results } = await scoped.migrator().migrateToLatest()
    expect(error).toBeUndefined()
    expect(results?.map(r => r.migrationName)).toEqual(['0005_roadmap_content_fixes'])

    const aws = seedFor(AWS_TITLE)
    const rows = await moduleRows(awsRoadmap)

    // Existing ids untouched, exactly one module added.
    const idsAfter = (await sql<{ id: number }>`SELECT id FROM modules ORDER BY id`.execute(db)).rows.map(r => r.id)
    expect(idsAfter).toEqual(expect.arrayContaining(idsBefore))
    expect(rows).toHaveLength(12)
    expect(rows.filter(r => r.title === NEW_AWS_MODULE)).toHaveLength(1)

    // Every old module keeps its id and sits at the position of the current seed.
    for (const [title, id] of oldModuleIds) {
      const row = rows.find(r => r.id === id)!
      const seedModule = aws.modules.find(m => m.title === title)!
      expect(row.title).toBe(title)
      expect(row.position).toBe(seedModule.position)
    }

    // The new module equals what a fresh seed stores, column by column.
    const inserted = rows.find(r => r.title === NEW_AWS_MODULE)!
    const seededNew = aws.modules.find(m => m.title === NEW_AWS_MODULE)!
    expect(inserted.position).toBe(1)
    for (const [column, value] of Object.entries(seededNew)) {
      expect(inserted[column], column).toEqual(value)
    }

    // Corrected fields of existing modules equal the current seed.
    const byTitle = (title: string) => rows.find(r => r.id === oldModuleIds.get(title))!
    const seedByTitle = (title: string) => aws.modules.find(m => m.title === title)!
    for (const column of ['contents', 'official_resources', 'practical_activity'] as const) {
      expect(byTitle('Amazon EC2')[column]).toBe(seedByTitle('Amazon EC2')[column])
    }
    expect(byTitle('AWS CLI').evaluation).toBe(seedByTitle('AWS CLI').evaluation)
    expect(byTitle('Proyecto final').official_resources).toBe(seedByTitle('Proyecto final').official_resources)
    expect(byTitle('Amazon S3').quiz_bank).toBe(seedByTitle('Amazon S3').quiz_bank)
    expect(JSON.parse(byTitle('Amazon S3').quiz_bank as string)).toHaveLength(5)
    expect(byTitle('Fundamentos cloud').quiz_bank).toBe(seedByTitle('Fundamentos cloud').quiz_bank)

    // Roadmap-level corrected fields.
    const [roadmap] = (await sql<Record<string, unknown>>`SELECT * FROM roadmaps WHERE id = ${awsRoadmap}`.execute(db)).rows
    expect(roadmap.description).toBe(aws.roadmap.description)
    expect(roadmap.objectives).toBe(aws.roadmap.objectives)
    expect(roadmap.duration_weeks_min).toBe(aws.roadmap.duration_weeks_min)
    expect(roadmap.duration_weeks_max).toBe(aws.roadmap.duration_weeks_max)

    // Renamed AI module: same id, new title and corrected fields.
    const ai = seedFor(AI_TITLE)
    const cloudAi = ai.modules.find(m => m.title.startsWith('Plataformas cloud de IA'))!
    const [renamed] = (await sql<Record<string, unknown>>`SELECT * FROM modules WHERE id = ${aiVertexModule}`.execute(db)).rows
    expect(renamed.title).toBe(cloudAi.title)
    expect(renamed.contents).toBe(cloudAi.contents)
    expect(renamed.official_resources).toBe(cloudAi.official_resources)

    // User data still points at the same modules.
    const [progress] = (await sql<{ current_module_id: number }>`SELECT current_module_id FROM user_roadmap_progress`.execute(db)).rows
    expect(progress.current_module_id).toBe(oldModuleIds.get('Amazon EC2'))
    const [attempt] = (await sql<{ module_id: number }>`SELECT module_id FROM user_quiz_attempts`.execute(db)).rows
    expect(attempt.module_id).toBe(oldModuleIds.get('Amazon S3'))
    const [session] = (await sql<{ module_id: number; questions: string }>`
      SELECT module_id, questions FROM quiz_attempt_sessions WHERE id = ${sessionId}
    `.execute(db)).rows
    expect(session.module_id).toBe(oldModuleIds.get('Amazon EC2'))
    expect(session.questions).toBe('[{"question":"snapshot"}]')

    warn.mockRestore()
  })

  it('preserves fields the fix did not correct and customised quiz banks', async () => {
    const rows = await moduleRows(awsRoadmap)
    const s3 = rows.find(r => r.id === oldModuleIds.get('Amazon S3'))!
    expect(s3.objective).toBe('Admin-edited objective')

    const iam = rows.find(r => r.id === oldModuleIds.get('AWS IAM'))!
    expect(iam.quiz_bank).toBe(CUSTOM_BANK)
    // ...but its position was still shifted.
    expect(iam.position).toBe(seedFor(AWS_TITLE).modules.find(m => m.title === 'AWS IAM')!.position)

    const [other] = (await sql<Record<string, unknown>>`SELECT * FROM modules WHERE id = ${aiOtherModule}`.execute(db)).rows
    expect(other.objective).toBe('keep me')
    expect(other.contents).toBe('["old content"]')
    const [aiRoadmapRow] = (await sql<Record<string, unknown>>`SELECT * FROM roadmaps WHERE id = ${aiRoadmap}`.execute(db)).rows
    expect(aiRoadmapRow.description).toBe('ai description')
  })

  it('skips a roadmap that does not exist (DevOps was never created) with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const migration = await import('../../migrations/0005_roadmap_content_fixes')
    await migration.up(db)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Roadmap "Roadmap desde 0 a DevOps Junior" not found'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('customised quiz bank'))
    warn.mockRestore()
  })

  it('is idempotent: running it again changes nothing', async () => {
    const before = await snapshot()
    const migration = await import('../../migrations/0005_roadmap_content_fixes')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await migration.up(db)
    await migration.up(db)
    vi.restoreAllMocks()
    expect(await snapshot()).toEqual(before)

    const second = await scoped.migrator().migrateToLatest()
    expect(second.error).toBeUndefined()
    expect(second.results).toEqual([])
  })
})

describeIfPostgres('migration 0005 on an empty database (real postgres, throwaway schema)', () => {
  const scoped = createScoped(`content_fix_empty_${suffix()}`)

  beforeAll(async () => {
    await scoped.create()
  })

  afterAll(async () => {
    await scoped.destroy()
  })

  it('is a no-op: nothing is inserted and nothing warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { error } = await scoped.migrator().migrateToLatest()
    expect(error).toBeUndefined()

    const { rows } = await sql<{ roadmaps: string; modules: string }>`
      SELECT (SELECT COUNT(*) FROM roadmaps) AS roadmaps, (SELECT COUNT(*) FROM modules) AS modules
    `.execute(scoped.db)
    expect(Number(rows[0].roadmaps)).toBe(0)
    expect(Number(rows[0].modules)).toBe(0)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
