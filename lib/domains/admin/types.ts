export type AdminDashboardData = {
  generated_at: string
  active_window_days: number
  paused_after_days: number
  overview: {
    total_users: number
    active_users: number
    started_roadmaps: number
    completed_roadmaps: number
    submitted_evidences: number
    stalled_users: number
  }
  popular_roadmaps: Array<{
    roadmap_id: number
    title: string
    learners_count: number
    active_learners_count: number
    completed_learners_count: number
  }>
  completed_modules: Array<{
    module_id: number
    title: string
    roadmap_id: number
    roadmap_title: string
    total_lessons: number
    learners_count: number
    completed_learners_count: number
  }>
  stalled_learners: Array<{
    user_id: number
    email: string
    name?: string | null
    roadmap_id: number
    roadmap_title: string
    current_module_title?: string | null
    completed_lessons_count: number
    total_lessons: number
    progress_percentage: number
    last_activity_at: string
    inactivity_days: number
  }>
}

export type AdminUserRecord = {
  id: number
  email: string
  name: string | null
  role: string | null
  is_active: number | null
  can_view_all_roadmaps: number | null
  created_at: Date | string
  updated_at: Date | string
}

export type UserRoadmapAccess = { user_id: number; roadmap_id: number }

export type UserCoreInsert = {
  email: string
  name: string | null
  role: 'admin' | 'user'
  password_hash: string
  created_at: string
  updated_at: string
}
