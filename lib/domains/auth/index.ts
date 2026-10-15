import type { DatabaseClient } from '../../persistence/database'
import { createAccountRepository } from './repositories/accountRepository'
import { createRateLimitRepository } from './repositories/rateLimitRepository'
import { createSessionRepository } from './repositories/sessionRepository'
import { makeAuthService } from './service'

export type { AuthService } from './service'
export { SESSION_MAX_AGE_SECONDS } from './service'
export type {
  AuthFailure,
  AuthResult,
  AuthRole,
  AuthUser,
  RoadmapReadScope
} from './types'
export { isSetupTokenValid, isValidRole, scopeAllowsRoadmap } from './policy'

function isReadAuthRequired() {
  return ['1', 'true', 'yes'].includes(String(process.env.REQUIRE_AUTH_FOR_READS || '').toLowerCase())
}

export { isReadAuthRequired }

export function createAuthService(db: DatabaseClient) {
  return makeAuthService(
    {
      sessions: createSessionRepository(db),
      accounts: createAccountRepository(db),
      rateLimits: createRateLimitRepository(db)
    },
    { readAuthRequired: isReadAuthRequired }
  )
}
