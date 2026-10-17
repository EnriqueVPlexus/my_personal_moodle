import { z } from 'zod'
import { timestampSchema } from './common'

/** User row of the admin API (never includes the password hash). */
export const adminUserSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  name: z.string().nullable(),
  role: z.string().nullable(),
  is_active: z.number().nullable(),
  can_view_all_roadmaps: z.number().nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema
})

/** `GET /api/users` rows and the result of `set_roadmap_access`: the user plus the roadmaps they can open. */
export const adminUserWithAccessSchema = adminUserSchema.extend({
  roadmap_access_ids: z.array(z.number().int())
})

export const adminUserListResponseSchema = z.array(adminUserWithAccessSchema)

export const dashboardResponseSchema = z.object({
  generated_at: z.string(),
  active_window_days: z.number(),
  paused_after_days: z.number(),
  overview: z.object({
    total_users: z.number(),
    active_users: z.number(),
    started_roadmaps: z.number(),
    completed_roadmaps: z.number(),
    submitted_evidences: z.number(),
    stalled_users: z.number()
  }),
  popular_roadmaps: z.array(z.object({
    roadmap_id: z.number().int(),
    title: z.string(),
    learners_count: z.number(),
    active_learners_count: z.number(),
    completed_learners_count: z.number()
  })),
  completed_modules: z.array(z.object({
    module_id: z.number().int(),
    title: z.string(),
    roadmap_id: z.number().int(),
    roadmap_title: z.string(),
    total_lessons: z.number(),
    learners_count: z.number(),
    completed_learners_count: z.number()
  })),
  stalled_learners: z.array(z.object({
    user_id: z.number().int(),
    email: z.string(),
    name: z.string().nullable().optional(),
    roadmap_id: z.number().int(),
    roadmap_title: z.string(),
    current_module_title: z.string().nullable().optional(),
    completed_lessons_count: z.number(),
    total_lessons: z.number(),
    progress_percentage: z.number(),
    last_activity_at: z.string(),
    inactivity_days: z.number()
  }))
})

/** Row of `GET /api/audit-logs` (latest 200, newest first). `details` is a JSON document stored as text. */
export const auditLogEntrySchema = z.object({
  id: z.number().int(),
  actor_user_id: z.number().nullable(),
  actor_email: z.string().nullable(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string().nullable(),
  details: z.string().nullable(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  created_at: timestampSchema
})

export type AdminUser = z.infer<typeof adminUserSchema>
export type AdminUserWithAccess = z.infer<typeof adminUserWithAccessSchema>
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>
export type AuditLogEntryContract = z.infer<typeof auditLogEntrySchema>
