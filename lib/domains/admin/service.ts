import { hashPassword } from '../auth/password'
import { DuplicateEmailError } from './errors'
import type { UnitOfWork } from '../shared/unitOfWork'
import type { DashboardRepository, RoadmapExistenceReader, UserAdminRepository } from './ports'
import type { AdminUserRecord } from './types'

export type AdminPorts = {
  users: UserAdminRepository
  dashboards: DashboardRepository
  roadmaps: RoadmapExistenceReader
  /** Atomic multi-write operations on users (sessions, roadmap access). */
  unitOfWork: UnitOfWork<{ users: UserAdminRepository }>
}

export type AdminActor = { id: number }

export type UserCommand =
  | { action: 'set_active'; is_active: boolean }
  | { action: 'reset_password'; password: string }
  | { action: 'set_roadmap_access'; can_view_all_roadmaps: boolean; roadmap_ids?: number[] }

/** Business rules that reject a command; the HTTP layer words the message. */
export type UserRuleViolation =
  | 'cannot_deactivate_self'
  | 'last_active_admin'
  | 'admin_has_full_access'
  | 'unknown_roadmaps'

export type AuditDescriptor = { action: string; details: Record<string, unknown> }

export type UserWithAccess = AdminUserRecord & { roadmap_access_ids: number[] }

export type UpdateUserOutcome =
  | { status: 'not_found' }
  | { status: 'rejected'; violation: UserRuleViolation }
  | { status: 'ok'; user: AdminUserRecord | UserWithAccess | undefined | null; audit: AuditDescriptor }

export type CreateUserOutcome =
  | { status: 'created'; id: number; user: AdminUserRecord | undefined; role: 'admin' | 'user' }
  | { status: 'duplicate_email' }
  | { status: 'failed' }

/** Admins always see every roadmap; others see all unless explicitly restricted. */
export function effectiveCanViewAll(user: Pick<AdminUserRecord, 'role' | 'can_view_all_roadmaps'>) {
  return user.role === 'admin' ? 1 : Number(user.can_view_all_roadmaps) === 0 ? 0 : 1
}

export function withRoadmapAccess(user: AdminUserRecord, roadmapAccessIds: number[]): UserWithAccess {
  return {
    ...user,
    can_view_all_roadmaps: effectiveCanViewAll(user),
    roadmap_access_ids: roadmapAccessIds
  }
}

export type AdminService = ReturnType<typeof makeAdminService>

export function makeAdminService(ports: AdminPorts, now: () => Date = () => new Date()) {
  const { users, dashboards, roadmaps, unitOfWork } = ports

  async function userWithRoadmapAccess(userId: number) {
    const user = await users.findById(userId)
    if (!user) return null

    return withRoadmapAccess(user, await users.findRoadmapAccessIds(userId))
  }

  return {
    getDashboard() {
      return dashboards.get({})
    },

    async listUsers(): Promise<UserWithAccess[]> {
      const allUsers = await users.findAll()
      const accessRows = await users.findAllRoadmapAccess()
      const accessByUser = accessRows.reduce((acc: Record<number, number[]>, row) => {
        const userId = Number(row.user_id)
        if (!acc[userId]) acc[userId] = []
        acc[userId].push(Number(row.roadmap_id))
        return acc
      }, {})

      return allUsers.map(user => withRoadmapAccess(user, accessByUser[Number(user.id)] || []))
    },

    async createUser(input: { email: string; name?: string | null; password: string; role?: 'admin' | 'user' }): Promise<CreateUserOutcome> {
      const role = input.role ?? 'user'
      const timestamp = now().toISOString()

      try {
        const id = await users.insert({
          email: input.email,
          name: input.name || null,
          role,
          password_hash: await hashPassword(input.password),
          created_at: timestamp,
          updated_at: timestamp
        })
        if (!id) return { status: 'failed' }

        return { status: 'created', id, user: await users.findById(id), role }
      } catch (error) {
        if (error instanceof DuplicateEmailError) return { status: 'duplicate_email' }
        throw error
      }
    },

    /**
     * Applies one administrative command to a user. The rules (cannot
     * deactivate yourself or the last active admin, admins always have full
     * roadmap access, access grants must reference existing roadmaps) live
     * here, independent of how the request arrived.
     */
    async updateUser(actor: AdminActor, userId: number, command: UserCommand): Promise<UpdateUserOutcome> {
      const target = await users.findById(userId)
      if (!target) return { status: 'not_found' }

      if (command.action === 'set_active') {
        const isActive = command.is_active

        if (!isActive && userId === actor.id) return { status: 'rejected', violation: 'cannot_deactivate_self' }

        if (!isActive && target.role === 'admin') {
          const otherActiveAdmins = await users.countActiveAdmins(userId)
          if (otherActiveAdmins === 0) return { status: 'rejected', violation: 'last_active_admin' }
        }

        // Deactivating must also revoke sessions: all or nothing.
        const changes = await unitOfWork.run(async ({ users: tx }) => {
          const updated = await tx.updateActive(userId, isActive, now().toISOString())
          if (updated && !isActive) await tx.deleteSessions(userId)
          return updated
        })
        if (!changes) return { status: 'not_found' }

        return {
          status: 'ok',
          user: await users.findById(userId),
          audit: { action: isActive ? 'user.activate' : 'user.deactivate', details: { email: target.email } }
        }
      }

      if (command.action === 'reset_password') {
        const passwordHash = await hashPassword(command.password)
        // A new password must also revoke sessions: all or nothing.
        const changes = await unitOfWork.run(async ({ users: tx }) => {
          const updated = await tx.updatePassword(userId, passwordHash, now().toISOString())
          if (updated) await tx.deleteSessions(userId)
          return updated
        })
        if (!changes) return { status: 'not_found' }

        return {
          status: 'ok',
          user: await users.findById(userId),
          audit: { action: 'user.reset_password', details: { email: target.email } }
        }
      }

      // set_roadmap_access
      if (target.role === 'admin') return { status: 'rejected', violation: 'admin_has_full_access' }

      const canViewAllRoadmaps = command.can_view_all_roadmaps
      const roadmapIds = canViewAllRoadmaps ? [] : command.roadmap_ids ?? []

      if (roadmapIds.length > 0) {
        const existingIds = await roadmaps.findExistingIds(roadmapIds)
        if (existingIds.length !== roadmapIds.length) return { status: 'rejected', violation: 'unknown_roadmaps' }
      }

      const timestamp = now().toISOString()
      // Replacing access is flag + delete + insert: a mid failure must not
      // leave the user with partial access.
      await unitOfWork.run(async ({ users: tx }) => {
        await tx.updateRoadmapAccessFlag(userId, canViewAllRoadmaps, timestamp)
        await tx.deleteRoadmapAccess(userId)
        await tx.insertRoadmapAccessMany(userId, roadmapIds, timestamp)
      })

      return {
        status: 'ok',
        user: await userWithRoadmapAccess(userId),
        audit: {
          action: 'user.update_roadmap_access',
          details: {
            email: target.email,
            can_view_all_roadmaps: canViewAllRoadmaps,
            roadmap_ids: roadmapIds
          }
        }
      }
    }
  }
}
