import aiRoadmapSeed from './seeds/aiRoadmapSeed.json'
import awsRoadmapSeed from './seeds/awsRoadmapSeed.json'
import iaDevopsRoadmapSeed from './seeds/iaDevopsRoadmapSeed.json'
import devopsRoadmapSeed from './seeds/devopsRoadmapSeed.json'
import { getSeedQuizForModule } from './seeds/quizBanks'
import { DEFAULT_ROADMAP_VERSION, normalizePublishedAt, normalizeRoadmapVersion } from '../../domains/content/version'
import { normalizeModuleLevel, parseDurationWeeks } from '../../domains/content/metadata'
import { saveRoadmapMetadata } from '../../domains/content/repositories/metadataRepository'

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
  version?: string
  published_at?: string
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
    quiz?: Array<{
      question: string
      answer: string
      options?: string[]
      explanation?: string
      feedback?: string
      type?: 'multiple_choice' | 'true_false' | 'code_snippet'
    }>
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

export async function seedRoadmaps(db: any) {
  // Only bootstrap the catalog when the table is completely empty. Once any
  // roadmap exists (seeded or admin-created), never touch it again on
  // startup: otherwise every process restart/cold start would overwrite
  // fields an admin edited through the UI, reverting their changes.
  const { count } = await db.get('SELECT COUNT(*) AS count FROM roadmaps')
  if (Number(count) > 0) return

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
  const existing = await db.get('SELECT id, version, published_at FROM roadmaps WHERE title = ?', [seed.title])
  let roadmapId = existing?.id
  const version = normalizeRoadmapVersion(seed.version) || existing?.version || DEFAULT_ROADMAP_VERSION
  const publishedAt = normalizePublishedAt(seed.published_at) || existing?.published_at || new Date().toISOString()

  if (roadmapId) {
    await db.run(
      `UPDATE roadmaps
       SET description = ?, duration = ?, objectives = ?, methodology = ?, evaluation_weights = ?,
           duration_weeks_min = ?, duration_weeks_max = ?, version = ?, published_at = ?
       WHERE id = ?`,
      [
        description,
        seed.duration ?? null,
        JSON.stringify(objectives),
        JSON.stringify(methodology),
        JSON.stringify(evaluationWeights),
        durationWeeksMin,
        durationWeeksMax,
        version,
        publishedAt,
        roadmapId
      ]
    )
  } else {
    const result = await db.run(
      `INSERT INTO roadmaps (
         title, description, duration, objectives, methodology, evaluation_weights,
         duration_weeks_min, duration_weeks_max, version, published_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        seed.title,
        description,
        seed.duration ?? null,
        JSON.stringify(objectives),
        JSON.stringify(methodology),
        JSON.stringify(evaluationWeights),
        durationWeeksMin,
        durationWeeksMax,
        version,
        publishedAt
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

    const quiz = moduleSeed.quiz && moduleSeed.quiz.length > 0
      ? moduleSeed.quiz
      : getSeedQuizForModule(normalizedModule.title)
    const quizBank = quiz.length > 0 ? JSON.stringify(quiz) : null

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
      normalizedModule.evaluation,
      quizBank
    ]

    if (moduleRow?.id) {
      await db.run(
        `UPDATE modules
         SET roadmap_id = ?, position = ?, title = ?, duration = ?,
             duration_weeks_min = ?, duration_weeks_max = ?, level = ?, objective = ?, contents = ?,
             importance = ?, official_resources = ?, support_videos = ?, practical_activity = ?,
             deliverable_evidence = ?, evaluation = ?, quiz_bank = ?
         WHERE id = ?`,
        [...values, moduleRow.id]
      )
    } else {
      await db.run(
        `INSERT INTO modules (
          roadmap_id, position, title, duration, duration_weeks_min, duration_weeks_max, level,
          objective, contents, importance,
          official_resources, support_videos, practical_activity, deliverable_evidence, evaluation, quiz_bank
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
