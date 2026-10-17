import { createHash, timingSafeEqual } from 'crypto'
import type { AuthRole, RoadmapReadScope } from './types'

export function isValidRole(role: unknown): role is AuthRole {
  return role === 'admin' || role === 'user'
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function secureCompare(a: string, b: string) {
  const first = Buffer.from(a)
  const second = Buffer.from(b)
  return first.length === second.length && timingSafeEqual(first, second)
}

export function scopeAllowsRoadmap(
  scope: Pick<RoadmapReadScope, 'allRoadmaps' | 'roadmapIds'>,
  roadmapId: unknown
) {
  if (scope.allRoadmaps) return true
  const id = Number(Array.isArray(roadmapId) ? roadmapId[0] : roadmapId)
  return Number.isInteger(id) && scope.roadmapIds.includes(id)
}

/**
 * Setup token rule: without a configured token the setup page is open outside
 * production; with one, the candidate must match it in constant time.
 */
export function isSetupTokenValid(candidate: string | undefined, expected: string | undefined, isProduction: boolean) {
  if (!expected) return !isProduction
  if (!candidate) return false
  return secureCompare(candidate, expected)
}
