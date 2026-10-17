import { buildModuleProgress } from '../../lib/domains/progress/moduleProgress'
import { buildModuleQuiz, gradeModuleQuiz, toPublicModuleQuiz } from '../../lib/domains/content/quizzes'
import { emptyCatalogMetadata } from '../../lib/domains/content'

/**
 * Realistic service results (what the repositories hand to the handlers).
 * Pure domain functions are used where they exist so the shapes are the real ones.
 */

export const admin = { id: 1, email: 'admin@example.com', name: 'Admin', role: 'admin' as const }
export const learner = { id: 2, email: 'ana@example.com', name: 'Ana', role: 'user' as const }

export const roadmapRecord = {
  id: 1,
  title: 'AWS',
  description: 'Cloud',
  duration: '8 semanas',
  objectives: '["Desplegar"]',
  methodology: null,
  evaluation_weights: null,
  category_id: 1,
  duration_weeks_min: 8,
  duration_weeks_max: 8,
  version: 'v1.0.0',
  published_at: '2026-01-01T00:00:00.000Z'
}

export const moduleRecord = {
  id: 3,
  roadmap_id: 1,
  position: 1,
  title: 'Redes',
  duration: '2 semanas',
  duration_weeks_min: 2,
  duration_weeks_max: 2,
  level: 'beginner',
  objective: 'Entender VPC',
  contents: JSON.stringify(['VPC', 'Subnets', 'Rutas', 'NAT', 'Seguridad']),
  importance: null,
  official_resources: null,
  support_videos: null,
  practical_activity: null,
  deliverable_evidence: null,
  evaluation: null,
  quiz_bank: null,
  quiz_pass_percentage: null,
  quiz_max_attempts: null,
  quiz_cooldown_minutes: null
}

export const lessonRecord = { id: 7, module_id: 3, title: 'Subnets', completed: 0 }

export const catalogRoadmap = {
  ...roadmapRecord,
  module_count: 4,
  category: { key: 'cloud', label: 'Cloud' },
  topics: [{ key: 'aws', label: 'AWS' }],
  user_progress_status: 'in_progress'
}

export const roadmapProgress = {
  roadmap_id: 1,
  started_at: '2026-02-01T10:00:00.000Z',
  last_activity_at: '2026-02-02T10:00:00.000Z',
  completed_at: null,
  completed_lessons_count: 1,
  total_lessons: 4,
  total_modules: 1,
  time_spent_seconds: 120,
  current_module_id: 3,
  current_module_title: 'Redes',
  current_lesson_id: 7,
  current_lesson_title: 'Subnets',
  progress_percentage: 25,
  status: 'in_progress' as const,
  next_href: '/modules/3',
  next_step_label: 'Continuar',
  modules: [{
    module_id: 3,
    title: 'Redes',
    position: 1,
    total_lessons: 4,
    completed_lessons_count: 1,
    progress_percentage: 25,
    status: 'in_progress' as const,
    last_activity_at: '2026-02-02T10:00:00.000Z',
    next_lesson_id: 7,
    next_lesson_title: 'Subnets'
  }]
}

export const roadmapDetail = {
  ...roadmapRecord,
  category: { key: 'cloud', label: 'Cloud' },
  topics: [{ key: 'aws', label: 'AWS' }],
  modules: [{ ...moduleRecord, has_evidence: 1, progress: roadmapProgress.modules[0] }],
  progress: roadmapProgress
}

const lessonsWithProgress = [{
  ...lessonRecord,
  progress_started_at: null,
  progress_last_activity_at: null,
  progress_completed_at: null,
  progress_time_spent_seconds: 0
}]

export const quizSummary = {
  attempts_count: 1,
  average_score_percentage: 0,
  best_score_percentage: 0,
  latest_attempt: { score: 0, max_score: 1, percentage: 0, submitted_at: '2026-02-02T10:00:00.000Z' }
}

export const eligibility = { allowed: true, remaining_attempts: null, cooldown_ends_at: null, pass_percentage: 70 }

export const publicQuiz = toPublicModuleQuiz(buildModuleQuiz(moduleRecord))

export const moduleDetail = {
  ...moduleRecord,
  lessons: lessonsWithProgress,
  progress: buildModuleProgress(lessonsWithProgress, true),
  quiz: publicQuiz,
  quiz_summary: quizSummary
}

export function quizAnswers(value = 0) {
  return Object.fromEntries(publicQuiz.questions.map(question => [question.id, value]))
}

export const gradedAttempt = {
  ...gradeModuleQuiz(moduleRecord, quizAnswers()),
  submitted_at: '2026-02-02T10:00:00.000Z'
}

export const lessonProgressResult = {
  lesson_id: 7,
  module_id: 3,
  roadmap_id: 1,
  title: 'Subnets',
  started_at: '2026-02-02T10:00:00.000Z',
  last_activity_at: '2026-02-02T10:00:00.000Z',
  completed_at: '2026-02-02T10:00:00.000Z',
  completed: 1,
  time_spent_seconds: 60,
  roadmap_completed_lessons_count: 2,
  roadmap_time_spent_seconds: 180
}

export const evidence = {
  id: 5,
  user_id: 2,
  module_id: 3,
  evidence_type: 'github' as const,
  url: 'https://github.com/ana/proyecto',
  note: null,
  review_status: 'pendiente' as const,
  admin_comment: null,
  reviewed_at: null,
  reviewed_by_user_id: null,
  created_at: '2026-02-02T10:00:00.000Z',
  updated_at: '2026-02-02T10:00:00.000Z'
}

export const evidenceListItem = {
  ...evidence,
  user_email: 'ana@example.com',
  user_name: 'Ana',
  module_title: 'Redes',
  module_position: 1,
  roadmap_id: 1,
  roadmap_title: 'AWS'
}

export const portfolio = {
  user: { id: 2, name: 'Ana', email: 'ana@example.com' },
  total_evidences: 1,
  approved_evidences: 0,
  roadmaps: [{
    id: 1,
    title: 'AWS',
    items: [{
      id: 5,
      module_id: 3,
      module_title: 'Redes',
      module_position: 1,
      roadmap_id: 1,
      roadmap_title: 'AWS',
      evidence_type: 'github' as const,
      url: 'https://github.com/ana/proyecto',
      note: null,
      review_status: 'pendiente' as const,
      admin_comment: null,
      reviewed_at: null,
      updated_at: '2026-02-02T10:00:00.000Z'
    }]
  }]
}

export const catalogMetadata = emptyCatalogMetadata()

export const roadmapDocument = {
  title: 'AWS',
  description: 'Cloud',
  duration: '8 semanas',
  duration_weeks_min: 8,
  duration_weeks_max: 8,
  category: 'Cloud',
  topics: ['AWS'],
  objectives: ['Desplegar'],
  methodology: [],
  evaluation_weights: { Proyecto: '100%' },
  version: 'v1.0.0',
  published_at: '2026-01-01T00:00:00.000Z',
  modules: [{
    position: 0,
    title: 'Redes',
    level: 'beginner' as const,
    duration: '2 semanas',
    duration_weeks_min: 2,
    duration_weeks_max: 2,
    objective: 'Entender VPC',
    contents: ['VPC'],
    importance: null,
    official_resources: [{ label: 'Docs', url: 'https://docs.aws.amazon.com' }],
    support_videos: [],
    practical_activity: [],
    deliverable_evidence: [],
    evaluation: null,
    quiz: [{ question: '¿Qué es una VPC?', answer: 'Red virtual', options: ['Red virtual', 'Disco'], explanation: null, type: 'multiple_choice' as const }]
  }]
}

export const adminUser = {
  id: 2,
  email: 'ana@example.com',
  name: 'Ana',
  role: 'user',
  is_active: 1,
  can_view_all_roadmaps: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
}

export const adminUserWithAccess = { ...adminUser, roadmap_access_ids: [1] }

export const dashboard = {
  generated_at: '2026-02-02T10:00:00.000Z',
  active_window_days: 7,
  paused_after_days: 14,
  overview: { total_users: 2, active_users: 1, started_roadmaps: 1, completed_roadmaps: 0, submitted_evidences: 1, stalled_users: 0 },
  popular_roadmaps: [{ roadmap_id: 1, title: 'AWS', learners_count: 1, active_learners_count: 1, completed_learners_count: 0 }],
  completed_modules: [{ module_id: 3, title: 'Redes', roadmap_id: 1, roadmap_title: 'AWS', total_lessons: 4, learners_count: 1, completed_learners_count: 0 }],
  stalled_learners: [{
    user_id: 2,
    email: 'ana@example.com',
    name: null,
    roadmap_id: 1,
    roadmap_title: 'AWS',
    current_module_title: 'Redes',
    completed_lessons_count: 1,
    total_lessons: 4,
    progress_percentage: 25,
    last_activity_at: '2026-01-10T10:00:00.000Z',
    inactivity_days: 23
  }]
}

export const auditEntry = {
  id: 1,
  actor_user_id: 1,
  actor_email: 'admin@example.com',
  action: 'lesson.create',
  entity_type: 'lesson',
  entity_id: '7',
  details: '{"title":"Subnets"}',
  ip_address: '127.0.0.1',
  user_agent: null,
  created_at: '2026-02-02T10:00:00.000Z'
}
