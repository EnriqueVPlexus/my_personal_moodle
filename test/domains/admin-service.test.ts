import { describe, expect, it } from 'vitest'
import { DuplicateEmailError } from '../../lib/domains/admin/errors'
import type { DashboardRepository, UserAdminRepository } from '../../lib/domains/admin/ports'
import { effectiveCanViewAll, makeAdminService } from '../../lib/domains/admin/service'
import type { AdminDashboardData, AdminUserRecord, UserCoreInsert } from '../../lib/domains/admin/types'

type State = {
  users: AdminUserRecord[]
  access: Array<{ user_id: number; roadmap_id: number }>
  sessions: number[]
  roadmaps: number[]
  calls: string[]
  /** Name of the repository method that must throw (failure injection). */
  failOn: string | null
  /** Number of units of work opened and how many were rolled back. */
  transactions: { started: number; rolledBack: number }
}

function user(id: number, role: 'admin' | 'user', overrides: Partial<AdminUserRecord> = {}): AdminUserRecord {
  return {
    id, email: `user${id}@example.com`, name: null, role, is_active: 1, can_view_all_roadmaps: 1,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', ...overrides
  }
}

function setup(users: AdminUserRecord[], roadmaps: number[] = [1, 2, 3]) {
  const state: State = { users, access: [], sessions: users.map(item => item.id), roadmaps, calls: [], failOn: null, transactions: { started: 0, rolledBack: 0 } }

  const repository: UserAdminRepository = {
    async findAll() { return state.users },
    async findById(id) { return state.users.find(item => item.id === id) },
    async findAllRoadmapAccess() { return state.access },
    async findRoadmapAccessIds(userId) {
      return state.access.filter(row => row.user_id === userId).map(row => row.roadmap_id)
    },
    async insert(data: UserCoreInsert) {
      if (state.users.some(item => item.email === data.email)) throw new DuplicateEmailError()
      const id = state.users.length + 1
      state.users.push(user(id, data.role, { email: data.email, name: data.name }))
      return id
    },
    async updateActive(id, isActive) {
      state.calls.push('updateActive')
      const target = state.users.find(item => item.id === id)
      if (!target) return 0
      target.is_active = isActive ? 1 : 0
      return 1
    },
    async updatePassword(id) {
      state.calls.push('updatePassword')
      return state.users.some(item => item.id === id) ? 1 : 0
    },
    async updateRoadmapAccessFlag(id, canViewAll) {
      state.calls.push('updateFlag')
      const target = state.users.find(item => item.id === id)
      if (target) target.can_view_all_roadmaps = canViewAll ? 1 : 0
      return target ? 1 : 0
    },
    async countActiveAdmins(excludeUserId) {
      state.calls.push('countActiveAdmins')
      return state.users.filter(item => item.role === 'admin' && item.is_active === 1 && item.id !== excludeUserId).length
    },
    async deleteSessions(userId) {
      state.calls.push('deleteSessions')
      if (state.failOn === 'deleteSessions') throw new Error('deleteSessions failed')
      state.sessions = state.sessions.filter(id => id !== userId)
    },
    async deleteRoadmapAccess(userId) {
      state.access = state.access.filter(row => row.user_id !== userId)
    },
    async insertRoadmapAccessMany(userId, roadmapIds) {
      if (state.failOn === 'insertRoadmapAccessMany') throw new Error('insertRoadmapAccessMany failed')
      roadmapIds.forEach(roadmapId => state.access.push({ user_id: userId, roadmap_id: roadmapId }))
    }
  }

  const dashboards: DashboardRepository = {
    async get() { return { overview: { total_users: users.length } } as unknown as AdminDashboardData }
  }

  const service = makeAdminService({
    users: repository,
    dashboards,
    roadmaps: { findExistingIds: async ids => ids.filter(id => state.roadmaps.includes(id)) },
    // Fake unit of work with real rollback semantics over the in-memory state.
    unitOfWork: {
      async run(work) {
        state.transactions.started += 1
        const snapshot = structuredClone({ users: state.users, access: state.access, sessions: state.sessions })
        try {
          return await work({ users: repository })
        } catch (error) {
          Object.assign(state, snapshot)
          state.transactions.rolledBack += 1
          throw error
        }
      }
    }
  }, () => new Date('2026-02-03T04:05:06.000Z'))

  return { state, service }
}

describe('admin rules: deactivating users', () => {
  it('does not allow an admin to deactivate their own account', async () => {
    const { service, state } = setup([user(1, 'admin'), user(2, 'admin')])

    expect(await service.updateUser({ id: 1 }, 1, { action: 'set_active', is_active: false }))
      .toEqual({ status: 'rejected', violation: 'cannot_deactivate_self' })
    expect(state.calls).not.toContain('updateActive')
  })

  it('does not allow deactivating the last active admin', async () => {
    const { service, state } = setup([user(1, 'admin'), user(2, 'admin', { is_active: 0 })])

    expect(await service.updateUser({ id: 3 }, 1, { action: 'set_active', is_active: false }))
      .toEqual({ status: 'rejected', violation: 'last_active_admin' })
    expect(state.calls.filter(call => call === 'countActiveAdmins')).toHaveLength(1)
    expect(state.users[0].is_active).toBe(1)
  })

  it('deactivates another admin when someone else remains active, revoking their sessions', async () => {
    const { service, state } = setup([user(1, 'admin'), user(2, 'admin')])

    const outcome = await service.updateUser({ id: 1 }, 2, { action: 'set_active', is_active: false })

    expect(outcome).toMatchObject({
      status: 'ok',
      audit: { action: 'user.deactivate', details: { email: 'user2@example.com' } }
    })
    expect(state.sessions).toEqual([1])
  })

  it('reactivating keeps sessions untouched and never needs the admin count', async () => {
    const { service, state } = setup([user(1, 'admin'), user(2, 'user', { is_active: 0 })])

    const outcome = await service.updateUser({ id: 1 }, 2, { action: 'set_active', is_active: true })

    expect(outcome).toMatchObject({ status: 'ok', audit: { action: 'user.activate' } })
    expect(state.calls).toEqual(['updateActive'])
  })

  it('reports an unknown target', async () => {
    const { service } = setup([user(1, 'admin')])
    expect(await service.updateUser({ id: 1 }, 99, { action: 'set_active', is_active: false })).toEqual({ status: 'not_found' })
  })
})

describe('admin rules: roadmap access', () => {
  it('admins always keep full access, so grants are rejected for them', async () => {
    const { service } = setup([user(1, 'admin'), user(2, 'admin')])

    expect(await service.updateUser({ id: 1 }, 2, { action: 'set_roadmap_access', can_view_all_roadmaps: false, roadmap_ids: [1] }))
      .toEqual({ status: 'rejected', violation: 'admin_has_full_access' })
  })

  it('rejects grants that reference roadmaps that do not exist', async () => {
    const { service, state } = setup([user(1, 'admin'), user(2, 'user')])

    expect(await service.updateUser({ id: 1 }, 2, { action: 'set_roadmap_access', can_view_all_roadmaps: false, roadmap_ids: [1, 99] }))
      .toEqual({ status: 'rejected', violation: 'unknown_roadmaps' })
    expect(state.calls).not.toContain('updateFlag')
  })

  it('replaces the grants and returns the user with their access ids', async () => {
    const { service, state } = setup([user(1, 'admin'), user(2, 'user')])
    state.access.push({ user_id: 2, roadmap_id: 3 })

    const outcome = await service.updateUser({ id: 1 }, 2, { action: 'set_roadmap_access', can_view_all_roadmaps: false, roadmap_ids: [1, 2] })

    expect(outcome).toMatchObject({
      status: 'ok',
      user: { id: 2, can_view_all_roadmaps: 0, roadmap_access_ids: [1, 2] },
      audit: { action: 'user.update_roadmap_access', details: { can_view_all_roadmaps: false, roadmap_ids: [1, 2] } }
    })
  })

  it('clears every grant when the user can view all roadmaps', async () => {
    const { service, state } = setup([user(1, 'admin'), user(2, 'user', { can_view_all_roadmaps: 0 })])
    state.access.push({ user_id: 2, roadmap_id: 3 })

    const outcome = await service.updateUser({ id: 1 }, 2, { action: 'set_roadmap_access', can_view_all_roadmaps: true, roadmap_ids: [1] })

    expect(outcome).toMatchObject({ status: 'ok', user: { can_view_all_roadmaps: 1, roadmap_access_ids: [] } })
    expect(state.access).toEqual([])
  })

  it('exposes the effective visibility flag', () => {
    expect(effectiveCanViewAll({ role: 'admin', can_view_all_roadmaps: 0 })).toBe(1)
    expect(effectiveCanViewAll({ role: 'user', can_view_all_roadmaps: 0 })).toBe(0)
    expect(effectiveCanViewAll({ role: 'user', can_view_all_roadmaps: 1 })).toBe(1)
  })
})

describe('admin use cases: users and passwords', () => {
  it('replaces the access inside one unit of work and rolls it back when a write fails', async () => {
    const { service, state } = setup([user(1, 'admin'), user(2, 'user', { can_view_all_roadmaps: 1 })])
    state.access.push({ user_id: 2, roadmap_id: 3 })
    state.failOn = 'insertRoadmapAccessMany'

    await expect(service.updateUser({ id: 1 }, 2, { action: 'set_roadmap_access', can_view_all_roadmaps: false, roadmap_ids: [1] }))
      .rejects.toThrow('insertRoadmapAccessMany failed')

    expect(state.transactions).toEqual({ started: 1, rolledBack: 1 })
    expect(state.access).toEqual([{ user_id: 2, roadmap_id: 3 }])
    expect(state.users[1].can_view_all_roadmaps).toBe(1)
  })

  it('opens one unit of work per write use case and none for rejected commands', async () => {
    const { service, state } = setup([user(1, 'admin'), user(2, 'user')])

    await service.updateUser({ id: 1 }, 2, { action: 'set_roadmap_access', can_view_all_roadmaps: true })
    await service.updateUser({ id: 1 }, 2, { action: 'set_active', is_active: false })
    await service.updateUser({ id: 1 }, 2, { action: 'reset_password', password: 'another-valid-password' })
    expect(state.transactions).toEqual({ started: 3, rolledBack: 0 })

    await service.updateUser({ id: 1 }, 1, { action: 'set_active', is_active: false })
    await service.updateUser({ id: 1 }, 99, { action: 'set_active', is_active: true })
    expect(state.transactions.started).toBe(3)
  })

  it('rolls the deactivation back when revoking sessions fails, and propagates the error', async () => {
    const { service, state } = setup([user(1, 'admin'), user(2, 'user')])
    state.failOn = 'deleteSessions'

    await expect(service.updateUser({ id: 1 }, 2, { action: 'set_active', is_active: false }))
      .rejects.toThrow('deleteSessions failed')

    expect(state.transactions.rolledBack).toBe(1)
    expect(state.users[1].is_active).toBe(1)
    expect(state.sessions).toEqual([1, 2])
  })

  it('lists users with their roadmap access and effective visibility', async () => {
    const { service, state } = setup([user(1, 'admin', { can_view_all_roadmaps: 0 }), user(2, 'user', { can_view_all_roadmaps: 0 })])
    state.access.push({ user_id: 2, roadmap_id: 2 }, { user_id: 2, roadmap_id: 1 })

    expect(await service.listUsers()).toMatchObject([
      { id: 1, can_view_all_roadmaps: 1, roadmap_access_ids: [] },
      { id: 2, can_view_all_roadmaps: 0, roadmap_access_ids: [2, 1] }
    ])
  })

  it('creates users, defaulting the role, and reports duplicated emails', async () => {
    const { service } = setup([user(1, 'admin')])

    expect(await service.createUser({ email: 'new@example.com', password: 'a-valid-password-1' }))
      .toMatchObject({ status: 'created', role: 'user', id: 2 })
    expect(await service.createUser({ email: 'new@example.com', password: 'a-valid-password-1' }))
      .toEqual({ status: 'duplicate_email' })
  })

  it('resets the password and revokes every session of the user', async () => {
    const { service, state } = setup([user(1, 'admin'), user(2, 'user')])

    const outcome = await service.updateUser({ id: 1 }, 2, { action: 'reset_password', password: 'another-valid-password' })

    expect(outcome).toMatchObject({ status: 'ok', audit: { action: 'user.reset_password' } })
    expect(state.sessions).toEqual([1])
  })

  it('delegates the dashboard to its repository', async () => {
    const { service } = setup([user(1, 'admin')])
    expect(await service.getDashboard()).toMatchObject({ overview: { total_users: 1 } })
  })
})
