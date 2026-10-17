import type { AdminDashboardData, AdminUserRecord, UserCoreInsert, UserRoadmapAccess } from './types'

/** Persistence port for user administration. `insert` throws DuplicateEmailError. */
export interface UserAdminRepository {
  findAll(): Promise<AdminUserRecord[]>
  findById(id: number): Promise<AdminUserRecord | undefined>
  findAllRoadmapAccess(): Promise<UserRoadmapAccess[]>
  findRoadmapAccessIds(userId: number): Promise<number[]>
  insert(data: UserCoreInsert): Promise<number>
  updateActive(id: number, isActive: boolean, updatedAt: string): Promise<number>
  updatePassword(id: number, passwordHash: string, updatedAt: string): Promise<number>
  updateRoadmapAccessFlag(id: number, canViewAllRoadmaps: boolean, updatedAt: string): Promise<number>
  /** Number of other active admins, excluding `excludeUserId`. */
  countActiveAdmins(excludeUserId: number): Promise<number>
  deleteSessions(userId: number): Promise<void>
  deleteRoadmapAccess(userId: number): Promise<void>
  insertRoadmapAccessMany(userId: number, roadmapIds: number[], createdAt: string): Promise<void>
}

export interface DashboardRepository {
  get(options: { now?: Date }): Promise<AdminDashboardData>
}

/** Catalog lookup needed to validate roadmap access grants. */
export interface RoadmapExistenceReader {
  findExistingIds(ids: number[]): Promise<number[]>
}
