import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest, createResponse } from './helpers/api'
import { writeAuditLog } from '../lib/audit'
import {
  asEvaluationWeights,
  asLearningLinks,
  asTextList,
  parseJsonValue
} from '../lib/roadmapPresentation'
import {
  buildModuleQuiz,
  gradeModuleQuiz,
  getModuleQuizSummary,
  saveModuleQuizAttempt,
  toPublicModuleQuiz
} from '../lib/quizzes'
import {
  hashPassword,
  normalizeEmail,
  validatePassword,
  verifyPassword
} from '../lib/password'
import {
  normalizeDurationRange,
  normalizeMetadataKey,
  normalizeModuleLevel,
  normalizeTopics,
  parseDurationWeeks
} from '../lib/roadmapMetadata'

describe('roadmap metadata helpers', () => {
  it('normalizes categories, topics and stable module levels', () => {
    expect(normalizeMetadataKey(' Inteligencia Artificial ')).toBe('inteligencia-artificial')
    expect(normalizeTopics('AWS, DevOps, aws, CI/CD')).toEqual(['AWS', 'DevOps', 'CI/CD'])
    expect(normalizeModuleLevel('beginner-intermediate')).toBe('intermediate')
    expect(normalizeModuleLevel('expert')).toBeNull()
  })

  it('turns displayed durations into comparable week ranges and validates manual ranges', () => {
    expect(parseDurationWeeks('1 o 2 semanas')).toEqual({ min: 1, max: 2 })
    expect(parseDurationWeeks('6 meses (5-8 h/semana)')).toEqual({ min: 24, max: 24 })
    expect(parseDurationWeeks('por definir')).toEqual({ min: null, max: null })
    expect(normalizeDurationRange('2', '4')).toEqual({ min: 2, max: 4 })
    expect(normalizeDurationRange('5', '2')).toBeNull()
  })
})

describe('password helpers', () => {
  it('normalizes email and validates password policy', () => {
    expect(normalizeEmail('  Admin@Example.COM ')).toBe('admin@example.com')
    expect(validatePassword('short')).toContain('al menos 12')
    expect(validatePassword(' '.repeat(12))).toContain('no puede estar vacía')
    expect(validatePassword('a'.repeat(257))).toContain('demasiado larga')
    expect(validatePassword('valid-password-123')).toBeNull()
  })

  it('hashes and verifies passwords without storing plain text', async () => {
    const hash = await hashPassword('valid-password-123')

    expect(hash).toMatch(/^scrypt:/)
    expect(hash).not.toContain('valid-password-123')
    await expect(verifyPassword('valid-password-123', hash)).resolves.toBe(true)
    await expect(verifyPassword('other-password-123', hash)).resolves.toBe(false)
    await expect(verifyPassword('valid-password-123', 'bad-hash')).resolves.toBe(false)
    await expect(verifyPassword('valid-password-123', hash.replace('scrypt', 'argon2'))).resolves.toBe(false)
    await expect(hashPassword('short')).rejects.toThrow('al menos 12')
  })
})

describe('roadmap presentation helpers', () => {
  it('parses json values safely', () => {
    expect(parseJsonValue('[1,2]', [])).toEqual([1, 2])
    expect(parseJsonValue('not-json', ['fallback'])).toEqual(['fallback'])
    expect(parseJsonValue(['already'], [])).toEqual(['already'])
  })

  it('converts text lists, links and evaluation weights', () => {
    expect(asTextList('single')).toEqual(['single'])
    expect(asTextList('["a","b"]')).toEqual(['a', 'b'])
    expect(asTextList(null)).toEqual([])

    expect(asLearningLinks('[{"label":"AWS","url":"https://aws.amazon.com"}]')).toEqual([
      { label: 'AWS', url: 'https://aws.amazon.com' }
    ])
    expect(asLearningLinks('plain')).toEqual([{ label: 'plain' }])

    expect(asEvaluationWeights('{"Quiz":"20%"}')).toEqual([{ label: 'Quiz', value: '20%' }])
  })
})

describe('quiz helpers', () => {
  const moduleFixture = {
    id: 4,
    roadmap_id: 7,
    title: 'EC2',
    contents: '["AMI","Security groups"]',
    official_resources: '[{"label":"Amazon EC2","url":"https://aws.amazon.com/ec2/"}]',
    practical_activity: '["Crear instancia"]',
    deliverable_evidence: '["Captura de la instancia"]',
    evaluation: 'Quiz sobre EC2'
  }

  it('builds public module quizzes from roadmap content and grades answers', () => {
    const quiz = buildModuleQuiz(moduleFixture)
    const publicQuiz = toPublicModuleQuiz(quiz)

    expect(quiz.questions).toHaveLength(3)
    expect(quiz.questions[0].prompt).toContain('EC2')
    expect(publicQuiz.questions[0]).not.toHaveProperty('correct_option_index')

    const answers = Object.fromEntries(
      quiz.questions.map(question => [question.id, question.correct_option_index])
    )
    const grade = gradeModuleQuiz(moduleFixture, answers)

    expect(grade).toMatchObject({
      score: 3,
      max_score: 3,
      percentage: 100,
      passed: true
    })
    expect(grade.feedback.every(item => item.is_correct)).toBe(true)
  })

  it('stores quiz attempts and builds quiz summaries', async () => {
    const db = {
      run: vi.fn(),
      get: vi.fn()
        .mockResolvedValueOnce({
          attempts_count: 2,
          average_score_percentage: 66.6,
          best_score_percentage: 100
        })
        .mockResolvedValueOnce({
          score: 2,
          max_score: 3,
          submitted_at: '2026-07-12T08:00:00.000Z'
        })
    }

    const attempt = await saveModuleQuizAttempt(db as any, 2, moduleFixture, {
      'module-content': 0
    })
    const summary = await getModuleQuizSummary(db as any, 2, 4)

    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_quiz_attempts'), expect.arrayContaining([
      2,
      7,
      4,
      'module',
      attempt.score,
      attempt.max_score
    ]))
    expect(summary).toMatchObject({
      attempts_count: 2,
      average_score_percentage: 67,
      best_score_percentage: 100,
      latest_attempt: {
        score: 2,
        max_score: 3,
        percentage: 67
      }
    })
  })
})

describe('audit helper', () => {
  it('stores admin action metadata without leaking implementation details', async () => {
    const db = { run: vi.fn() }
    const req = createRequest({
      headers: {
        'x-forwarded-for': '10.0.0.1, 10.0.0.2',
        'user-agent': 'vitest'
      }
    })

    await writeAuditLog({
      db,
      req,
      user: { id: 1, email: 'admin@example.com', role: 'admin' },
      action: 'user.create',
      entityType: 'user',
      entityId: 2,
      details: { email: 'user@example.com' }
    })

    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'), [
      1,
      'admin@example.com',
      'user.create',
      'user',
      '2',
      JSON.stringify({ email: 'user@example.com' }),
      '10.0.0.1',
      'vitest',
      expect.any(String)
    ])
  })

  it('stores anonymous audit metadata with safe null defaults', async () => {
    const db = { run: vi.fn() }
    const req = createRequest({
      headers: {
        'user-agent': ['vitest-array-agent']
      },
      socket: { remoteAddress: undefined }
    })

    await writeAuditLog({
      db,
      req,
      action: 'roadmap.read',
      entityType: 'roadmap'
    })

    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'), [
      null,
      null,
      'roadmap.read',
      'roadmap',
      null,
      null,
      null,
      'vitest-array-agent',
      expect.any(String)
    ])
  })
})

describe('auth helper', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.AUTH_SETUP_TOKEN
    delete process.env.REQUIRE_AUTH_FOR_READS
  })

  it('creates, reads and clears cookie-backed sessions', async () => {
    const db = {
      run: vi.fn(),
      get: vi.fn().mockResolvedValue({ id: 1, email: 'admin@example.com', role: 'admin' })
    }
    const { createSession, clearSession, getUserFromRequest } = await import('../lib/auth')
    const res = createResponse()

    await createSession(res, 1, db)
    const cookie = String(res.headers['Set-Cookie'])
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')

    const req = createRequest({ headers: { cookie } })
    await expect(getUserFromRequest(req, db)).resolves.toEqual({ id: 1, email: 'admin@example.com', role: 'admin' })

    await clearSession(req, res, db)
    expect(String(res.headers['Set-Cookie'])).toContain('Max-Age=0')
  })

  it('sets secure cookies in production and tolerates missing sessions', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const db = {
      run: vi.fn(),
      get: vi.fn()
    }
    const { createSession, clearSession, getUserFromRequest } = await import('../lib/auth')
    const res = createResponse()

    await createSession(res, 1, db)
    expect(String(res.headers['Set-Cookie'])).toContain('; Secure')

    await expect(getUserFromRequest(createRequest(), db)).resolves.toBeNull()
    await clearSession(createRequest(), res, db)
    expect(db.run).not.toHaveBeenCalledWith(expect.stringContaining('DELETE FROM sessions WHERE token_hash'), expect.any(Array))

    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  })

  it('rejects unknown session users and non-admin roles', async () => {
    const { getUserFromRequest, requireAdmin } = await import('../lib/auth')
    const inactiveDb = {
      get: vi.fn().mockResolvedValueOnce(null),
      run: vi.fn()
    }
    await expect(getUserFromRequest(createRequest({ headers: { cookie: 'moodle_session=token' } }), inactiveDb)).resolves.toBeNull()

    const invalidRoleDb = {
      get: vi.fn().mockResolvedValueOnce({ id: 1, email: 'bad@example.com', role: 'owner' }),
      run: vi.fn()
    }
    await expect(getUserFromRequest(createRequest({ headers: { cookie: 'moodle_session=token' } }), invalidRoleDb)).resolves.toBeNull()

    const noUserRes = createResponse()
    await expect(requireAdmin(createRequest({ headers: { cookie: 'moodle_session=missing' } }), noUserRes, {
      get: vi.fn().mockResolvedValue(null),
      run: vi.fn()
    })).resolves.toBeNull()
    expect(noUserRes.statusCode).toBe(401)

    const userRes = createResponse()
    await expect(requireAdmin(createRequest({ headers: { cookie: 'moodle_session=user' } }), userRes, {
      get: vi.fn().mockResolvedValue({ id: 2, email: 'user@example.com', role: 'user' }),
      run: vi.fn()
    })).resolves.toBeNull()
    expect(userRes.statusCode).toBe(403)
  })

  it('enforces admin and same-origin rules', async () => {
    const { requireAdmin, requireSameOrigin } = await import('../lib/auth')
    const forbidden = createResponse()

    expect(requireSameOrigin(createRequest({
      method: 'POST',
      headers: { origin: 'https://evil.example', host: 'localhost:3000' }
    }), forbidden)).toBe(false)
    expect(forbidden.statusCode).toBe(403)

    const okReq = createRequest({
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
        cookie: 'moodle_session=token'
      }
    })
    const okRes = createResponse()
    const db = {
      get: vi.fn().mockResolvedValue({ id: 1, email: 'admin@example.com', role: 'admin' }),
      run: vi.fn()
    }

    await expect(requireAdmin(okReq, okRes, db)).resolves.toEqual({
      id: 1,
      email: 'admin@example.com',
      role: 'admin'
    })
  })

  it('accepts safe origin variants and rejects malformed origin headers', async () => {
    const { requireSameOrigin } = await import('../lib/auth')

    expect(requireSameOrigin(createRequest({ method: 'GET' }), createResponse())).toBe(true)
    expect(requireSameOrigin(createRequest({ method: 'POST' }), createResponse())).toBe(true)

    const missingHost = createResponse()
    expect(requireSameOrigin(createRequest({
      method: 'POST',
      headers: { origin: 'http://localhost:3000' }
    }), missingHost)).toBe(false)
    expect(missingHost.body.error).toBe('origin check failed')

    const invalidOrigin = createResponse()
    expect(requireSameOrigin(createRequest({
      method: 'POST',
      headers: { origin: 'not a url', host: 'localhost:3000' }
    }), invalidOrigin)).toBe(false)
    expect(invalidOrigin.body.error).toBe('invalid origin')

    const forwardedHost = createResponse()
    expect(requireSameOrigin(createRequest({
      method: 'PATCH',
      headers: {
        origin: 'https://app.example.com',
        host: 'internal:3000',
        'x-forwarded-host': ['app.example.com']
      }
    }), forwardedHost)).toBe(true)
  })

  it('supports setup token and private-read mode', async () => {
    process.env.AUTH_SETUP_TOKEN = 'secret-token'
    process.env.REQUIRE_AUTH_FOR_READS = 'true'
    const { requireReadAccess, validateSetupToken } = await import('../lib/auth')

    expect(validateSetupToken('secret-token')).toBe(true)
    expect(validateSetupToken('bad-token')).toBe(false)
    expect(validateSetupToken(undefined)).toBe(false)
    expect(validateSetupToken('secret-tokeN')).toBe(false)

    const res = createResponse()
    await expect(requireReadAccess(createRequest(), res, { get: vi.fn(), run: vi.fn() })).resolves.toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('allows public reads by default and validates setup mode defaults', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    const { requireReadAccess, validateSetupToken } = await import('../lib/auth')

    await expect(requireReadAccess(createRequest(), createResponse())).resolves.toBe(true)
    expect(validateSetupToken(undefined)).toBe(true)

    process.env.NODE_ENV = 'production'
    expect(validateSetupToken(undefined)).toBe(false)
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  })

  it('builds public, admin and unrestricted user roadmap scopes', async () => {
    const { getRoadmapReadScope } = await import('../lib/auth')

    await expect(getRoadmapReadScope(createRequest(), createResponse(), {
      get: vi.fn(),
      run: vi.fn()
    })).resolves.toEqual({ user: null, allRoadmaps: true, roadmapIds: [] })

    const admin = { id: 1, email: 'admin@example.com', role: 'admin' }
    await expect(getRoadmapReadScope(
      createRequest({ headers: { cookie: 'moodle_session=admin' } }),
      createResponse(),
      { get: vi.fn().mockResolvedValue(admin), run: vi.fn() }
    )).resolves.toEqual({ user: admin, allRoadmaps: true, roadmapIds: [] })

    const user = { id: 2, email: 'user@example.com', role: 'user' }
    await expect(getRoadmapReadScope(
      createRequest({ headers: { cookie: 'moodle_session=user' } }),
      createResponse(),
      {
        get: vi.fn().mockResolvedValueOnce(user).mockResolvedValueOnce({ can_view_all_roadmaps: 1 }),
        run: vi.fn()
      }
    )).resolves.toEqual({ user, allRoadmaps: true, roadmapIds: [] })
  })

  it('enforces restricted roadmap scopes and rejects missing user settings', async () => {
    const { getRoadmapReadScope, scopeAllowsRoadmap } = await import('../lib/auth')
    const user = { id: 2, email: 'user@example.com', role: 'user' }
    const restricted = await getRoadmapReadScope(
      createRequest({ headers: { cookie: 'moodle_session=user' } }),
      createResponse(),
      {
        get: vi.fn().mockResolvedValueOnce(user).mockResolvedValueOnce({ can_view_all_roadmaps: 0 }),
        all: vi.fn().mockResolvedValue([{ roadmap_id: 7 }, { roadmap_id: '8' }, { roadmap_id: 'invalid' }]),
        run: vi.fn()
      }
    )

    expect(restricted).toEqual({ user, allRoadmaps: false, roadmapIds: [7, 8] })
    expect(scopeAllowsRoadmap(restricted!, '7')).toBe(true)
    expect(scopeAllowsRoadmap(restricted!, ['8'])).toBe(true)
    expect(scopeAllowsRoadmap(restricted!, '9')).toBe(false)
    expect(scopeAllowsRoadmap(restricted!, 'invalid')).toBe(false)
    expect(scopeAllowsRoadmap({ user, allRoadmaps: true, roadmapIds: [] }, 'anything')).toBe(true)

    const missingSettingsRes = createResponse()
    await expect(getRoadmapReadScope(
      createRequest({ headers: { cookie: 'moodle_session=user' } }),
      missingSettingsRes,
      {
        get: vi.fn().mockResolvedValueOnce(user).mockResolvedValueOnce(null),
        run: vi.fn()
      }
    )).resolves.toBeNull()
    expect(missingSettingsRes.statusCode).toBe(401)

    process.env.REQUIRE_AUTH_FOR_READS = 'true'
    const privateRes = createResponse()
    await expect(getRoadmapReadScope(createRequest(), privateRes, {
      get: vi.fn(),
      run: vi.fn()
    })).resolves.toBeNull()
    expect(privateRes.statusCode).toBe(401)
  })
})
