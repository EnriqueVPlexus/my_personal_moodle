import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import path from 'path'
import fs from 'fs'
import aiRoadmapSeed from './roadmapSeeds/aiRoadmapSeed.json'
import awsRoadmapSeed from './roadmapSeeds/awsRoadmapSeed.json'
import iaDevopsRoadmapSeed from './iaDevopsRoadmapSeed.json'
import devopsRoadmapSeed from './devopsRoadmapSeed.json'
import { hashPassword, normalizeEmail, validatePassword } from './password'
import {
  normalizeModuleLevel,
  parseDurationWeeks,
  saveRoadmapMetadata
} from './roadmapMetadata'

type LearningResource = {
  label?: string
  title?: string
  provider?: string
  type?: string
  url?: string
}

type ProjectSeed =
  | {
      name?: string
      description?: string
      features?: string[]
      must_include?: string[]
    }
  | Array<{
      name?: string
      description?: string
      must_include?: string[]
    }>

type RoadmapSeed = {
  title: string
  category?: string
  topics?: string[]
  duration?: string
  description?: string
  positioning_goal?: string
  target_profile?: string[]
  learning_principles?: string[]
  estimated_duration?: {
    total_months?: number
    weekly_commitment_hours?: string
    mode?: string
  }
  recommended_stack?: Record<string, string[]>
  suggested_monthly_plan?: Array<{
    month: number
    focus: string
    outputs?: string[]
  }>
  objectives?: string[]
  methodology?: string[]
  evaluation_weights?: Record<string, string>
  modules: Array<{
    position?: number
    title: string
    level?: string
    duration?: string
    duration_weeks?: number
    objective?: string
    goal?: string
    contents?: string[]
    topics?: string[]
    importance?: string
    importance_for_sre_devops?: string
    resources?: LearningResource[]
    official_resources?: Array<{ label: string; url?: string }>
    support_videos?: Array<{ label: string; url?: string }>
    practical_activity?: string | string[]
    project?: ProjectSeed
    portfolio_projects?: ProjectSeed
    linkedin_cv_positioning?: {
      headline?: string
      about_text?: string
      skills_to_add?: string[]
      headline_options?: string[]
      summary_keywords?: string[]
    }
    deliverable?: string | string[]
    deliverable_evidence?: string | string[]
    deliverables?: string[]
    evaluation?: string
    quiz?: Array<{ question: string; answer: string }>
  }>
}

const roadmapSeeds: RoadmapSeed[] = [awsRoadmapSeed, aiRoadmapSeed, iaDevopsRoadmapSeed, devopsRoadmapSeed]

const seedMetadata: Record<string, { category: string; topics: string[] }> = {
  'Roadmap AWS gratuito para cantera junior DevOps': {
    category: 'Cloud y DevOps',
    topics: ['AWS', 'Cloud', 'DevOps', 'Terraform', 'Docker', 'CI/CD']
  },
  'Roadmap IA para SRE/DevOps - Versión 2.0': {
    category: 'Inteligencia artificial',
    topics: ['IA generativa', 'SRE', 'DevOps', 'MLOps', 'LLMOps', 'Cloud']
  },
  'IA para DevOps': {
    category: 'Inteligencia artificial',
    topics: ['IA generativa', 'DevOps', 'RAG', 'Agentes', 'MLOps', 'Cloud']
  },
  'Roadmap desde 0 a DevOps Junior': {
    category: 'Cloud y DevOps',
    topics: ['Linux', 'Git', 'Cloud', 'Docker', 'Terraform', 'Ansible', 'Kubernetes', 'CI/CD']
  }
}

const iaModuleLevels = [
  'beginner', 'intermediate', 'intermediate', 'intermediate', 'intermediate',
  'intermediate', 'advanced', 'advanced', 'advanced', 'advanced', 'capstone'
]

const seedModuleLevels: Record<string, string[]> = {
  'Roadmap AWS gratuito para cantera junior DevOps': [
    'beginner', 'beginner', 'beginner', 'beginner', 'beginner', 'beginner',
    'beginner', 'intermediate', 'intermediate', 'intermediate', 'capstone'
  ],
  'Roadmap IA para SRE/DevOps - Versión 2.0': iaModuleLevels,
  'IA para DevOps': iaModuleLevels,
  'Roadmap desde 0 a DevOps Junior': [
    'beginner', 'beginner', 'beginner', 'beginner',
    'intermediate', 'intermediate', 'intermediate', 'intermediate',
    'intermediate', 'intermediate', 'advanced', 'advanced'
  ]
}

const DATA_DIR = path.resolve(process.cwd(), 'data')
const DB_FILE = path.join(DATA_DIR, 'dev.db')
let initialized = false

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

    CREATE TABLE IF NOT EXISTS user_module_evidences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      module_id INTEGER NOT NULL,
      evidence_type TEXT NOT NULL,
      url TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
      UNIQUE (user_id, module_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_module_evidences_user_id ON user_module_evidences(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_module_evidences_module_id ON user_module_evidences(module_id);
    CREATE INDEX IF NOT EXISTS idx_user_module_evidences_updated_at ON user_module_evidences(updated_at);
  `)

  await ensureColumn(db, 'roadmaps', 'objectives', 'TEXT')
  await ensureColumn(db, 'roadmaps', 'duration', 'TEXT')
  await ensureColumn(db, 'roadmaps', 'methodology', 'TEXT')
  await ensureColumn(db, 'roadmaps', 'evaluation_weights', 'TEXT')
  await ensureColumn(db, 'roadmaps', 'category_id', 'INTEGER REFERENCES roadmap_categories(id) ON DELETE SET NULL')
  await ensureColumn(db, 'roadmaps', 'duration_weeks_min', 'REAL')
  await ensureColumn(db, 'roadmaps', 'duration_weeks_max', 'REAL')

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

async function seedRoadmaps(db: any) {
  for (const seed of roadmapSeeds) {
    await seedRoadmap(db, seed)
  }
}

async function seedRoadmap(db: any, seed: RoadmapSeed) {
  const description = seed.description ?? seed.positioning_goal ?? null
  const objectives = normalizeRoadmapObjectives(seed)
  const methodology = normalizeRoadmapMethodology(seed)
  const evaluationWeights = seed.evaluation_weights ?? {
    'Entregables prácticos': '40%',
    'Proyecto final': '30%',
    'Portfolio y documentación': '20%',
    'Credenciales y posicionamiento': '10%'
  }
  const normalizedModules = seed.modules.map((moduleSeed, index) => normalizeModuleSeed(
    moduleSeed,
    index,
    seedModuleLevels[seed.title]?.[index]
  ))
  const displayedDuration = seed.duration ?? (
    seed.estimated_duration?.total_months ? `${seed.estimated_duration.total_months} meses` : null
  )
  const parsedRoadmapDuration = parseDurationWeeks(displayedDuration)
  const moduleDuration = normalizedModules.reduce((total, module) => ({
    min: total.min + (module.duration_weeks_min ?? 0),
    max: total.max + (module.duration_weeks_max ?? 0)
  }), { min: 0, max: 0 })
  const durationWeeksMin = parsedRoadmapDuration.min ?? (moduleDuration.min || null)
  const durationWeeksMax = parsedRoadmapDuration.max ?? (moduleDuration.max || null)
  const existing = await db.get('SELECT id FROM roadmaps WHERE title = ?', [seed.title])
  let roadmapId = existing?.id

  if (roadmapId) {
    await db.run(
      `UPDATE roadmaps
       SET description = ?, duration = ?, objectives = ?, methodology = ?, evaluation_weights = ?,
           duration_weeks_min = ?, duration_weeks_max = ?
       WHERE id = ?`,
      [
        description,
        seed.duration ?? null,
        JSON.stringify(objectives),
        JSON.stringify(methodology),
        JSON.stringify(evaluationWeights),
        durationWeeksMin,
        durationWeeksMax,
        roadmapId
      ]
    )
  } else {
    const result = await db.run(
      `INSERT INTO roadmaps (
         title, description, duration, objectives, methodology, evaluation_weights,
         duration_weeks_min, duration_weeks_max
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        seed.title,
        description,
        seed.duration ?? null,
        JSON.stringify(objectives),
        JSON.stringify(methodology),
        JSON.stringify(evaluationWeights),
        durationWeeksMin,
        durationWeeksMax
      ]
    )
    roadmapId = result.lastID
  }

  const metadata = seedMetadata[seed.title]
  await saveRoadmapMetadata(
    db,
    roadmapId,
    seed.category ?? metadata?.category,
    seed.topics ?? metadata?.topics ?? []
  )

  for (const [index, moduleSeed] of seed.modules.entries()) {
    const normalizedModule = normalizedModules[index]
    const deliverableEvidence = moduleSeed.deliverable_evidence ?? moduleSeed.deliverable ?? null
    const moduleRow = await db.get(
      'SELECT id FROM modules WHERE roadmap_id = ? AND (position = ? OR title = ?)',
      [roadmapId, normalizedModule.position, normalizedModule.title]
    )

    const values = [
      roadmapId,
      normalizedModule.position,
      normalizedModule.title,
      normalizedModule.duration,
      normalizedModule.duration_weeks_min,
      normalizedModule.duration_weeks_max,
      normalizedModule.level,
      normalizedModule.objective,
      JSON.stringify(normalizedModule.contents),
      normalizedModule.importance,
      JSON.stringify(normalizedModule.official_resources),
      JSON.stringify(normalizedModule.support_videos),
      JSON.stringify(normalizedModule.practical_activity),
      JSON.stringify(normalizedModule.deliverable_evidence ?? deliverableEvidence),
      normalizedModule.evaluation
    ]

    if (moduleRow?.id) {
      await db.run(
        `UPDATE modules
         SET roadmap_id = ?, position = ?, title = ?, duration = ?,
             duration_weeks_min = ?, duration_weeks_max = ?, level = ?, objective = ?, contents = ?,
             importance = ?, official_resources = ?, support_videos = ?, practical_activity = ?,
             deliverable_evidence = ?, evaluation = ?
         WHERE id = ?`,
        [...values, moduleRow.id]
      )
    } else {
      await db.run(
        `INSERT INTO modules (
          roadmap_id, position, title, duration, duration_weeks_min, duration_weeks_max, level,
          objective, contents, importance,
          official_resources, support_videos, practical_activity, deliverable_evidence, evaluation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      )
    }
  }
}

function normalizeRoadmapObjectives(seed: RoadmapSeed) {
  if (seed.objectives?.length) return seed.objectives

  return [
    seed.positioning_goal,
    seed.target_profile?.length ? `Perfil objetivo: ${seed.target_profile.join(', ')}` : null,
    ...(seed.learning_principles ?? [])
  ].filter((item): item is string => Boolean(item))
}

function normalizeRoadmapMethodology(seed: RoadmapSeed) {
  if (seed.methodology?.length) return seed.methodology

  const duration = seed.estimated_duration
    ? `Duración estimada: ${seed.estimated_duration.total_months ?? '?'} meses, ${seed.estimated_duration.weekly_commitment_hours ?? '?'} h/semana, ${seed.estimated_duration.mode ?? 'modalidad flexible'}.`
    : null
  const monthlyPlan = seed.suggested_monthly_plan?.map(month => {
    const outputs = month.outputs?.length ? ` Entregables: ${month.outputs.join(', ')}.` : ''
    return `Mes ${month.month}: ${month.focus}.${outputs}`
  }) ?? []
  const stack = seed.recommended_stack
    ? Object.entries(seed.recommended_stack).map(([area, items]) => `${area}: ${items.join(', ')}`)
    : []

  return [
    duration,
    ...(seed.learning_principles ?? []),
    ...monthlyPlan,
    ...stack
  ].filter((item): item is string => Boolean(item))
}

function normalizeModuleSeed(
  moduleSeed: RoadmapSeed['modules'][number],
  index: number,
  defaultLevel?: string
) {
  const project = moduleSeed.project ?? moduleSeed.portfolio_projects
  const resources = moduleSeed.resources ?? []
  const officialResources = moduleSeed.official_resources ?? resources
    .filter(resource => resource.type !== 'linkedin_learning' && resource.type !== 'udemy_business_search')
    .map(toLearningLink)
  const supportResources = moduleSeed.support_videos ?? resources
    .filter(resource => resource.type === 'linkedin_learning' || resource.type === 'udemy_business_search')
    .map(toLearningLink)

  const duration = moduleSeed.duration ?? (
    moduleSeed.duration_weeks ? `${moduleSeed.duration_weeks} ${moduleSeed.duration_weeks === 1 ? 'semana' : 'semanas'}` : null
  )
  const durationWeeks = moduleSeed.duration_weeks
    ? { min: moduleSeed.duration_weeks, max: moduleSeed.duration_weeks }
    : parseDurationWeeks(duration)

  return {
    position: moduleSeed.position ?? index,
    title: moduleSeed.title,
    duration,
    duration_weeks_min: durationWeeks.min,
    duration_weeks_max: durationWeeks.max,
    level: normalizeModuleLevel(moduleSeed.level) ?? normalizeModuleLevel(defaultLevel),
    objective: moduleSeed.objective ?? moduleSeed.goal ?? null,
    contents: moduleSeed.contents ?? moduleSeed.topics ?? normalizeProjectTopics(project),
    importance: moduleSeed.importance ?? moduleSeed.importance_for_sre_devops ?? normalizeProjectDescription(project),
    official_resources: officialResources,
    support_videos: supportResources,
    practical_activity: moduleSeed.practical_activity ?? normalizeProjectActivity(project, moduleSeed.linkedin_cv_positioning),
    deliverable_evidence: moduleSeed.deliverable_evidence ?? moduleSeed.deliverable ?? moduleSeed.deliverables ?? null,
    evaluation: moduleSeed.evaluation ?? normalizeQuizEvaluation(moduleSeed.quiz)
  }
}

function toLearningLink(resource: LearningResource) {
  return {
    label: [resource.provider, resource.title ?? resource.label].filter(Boolean).join(' - '),
    url: resource.url
  }
}

function normalizeProjectTopics(project?: ProjectSeed) {
  if (Array.isArray(project)) {
    return project.flatMap(item => [
      item.name,
      item.description,
      ...(item.must_include ?? []).map(feature => `Debe incluir: ${feature}`)
    ]).filter((item): item is string => Boolean(item))
  }

  return [
    project?.name,
    project?.description,
    ...(project?.features ?? project?.must_include ?? [])
  ].filter((item): item is string => Boolean(item))
}

function normalizeProjectDescription(project?: ProjectSeed) {
  if (Array.isArray(project)) return 'El módulo se orienta a elegir y cerrar una pieza de portfolio profesional.'
  return project?.description ?? null
}

function normalizeProjectActivity(
  project?: ProjectSeed,
  positioning?: RoadmapSeed['modules'][number]['linkedin_cv_positioning']
) {
  const projectItems = normalizeProjectTopics(project)
  const positioningItems = [
    positioning?.headline ? `Headline LinkedIn: ${positioning.headline}` : null,
    positioning?.about_text ? `About LinkedIn: ${positioning.about_text}` : null,
    ...(positioning?.skills_to_add ?? []).map(item => `Skill CV/LinkedIn: ${item}`),
    ...(positioning?.headline_options ?? []).map(item => `Headline LinkedIn: ${item}`),
    ...(positioning?.summary_keywords ?? []).map(item => `Keyword CV/LinkedIn: ${item}`)
  ].filter((item): item is string => Boolean(item))

  return [...projectItems, ...positioningItems]
}

function normalizeQuizEvaluation(quiz?: Array<{ question: string; answer: string }>) {
  if (!quiz?.length) return 'Evaluación mediante revisión de entregables y defensa técnica.'
  return quiz.map(item => `${item.question} ${item.answer}`).join(' ')
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
