import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest, createResponse } from './helpers/api'

const admin = { id: 1, email: 'admin@example.com', role: 'admin' as const }
const user = { id: 2, email: 'user@example.com', role: 'user' as const }

async function mockApi(db: any, options: { admin?: any; read?: boolean; user?: any; scope?: any } = {}) {
  vi.resetModules()
  vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
  vi.doMock('../lib/auth', () => ({
    requireAdmin: vi.fn().mockResolvedValue(options.admin === undefined ? admin : options.admin),
    requireReadAccess: vi.fn().mockResolvedValue(options.read !== false),
    getUserFromRequest: vi.fn().mockResolvedValue(options.user ?? null),
    requireUser: vi.fn().mockResolvedValue(options.user ?? null),
    getRoadmapReadScope: vi.fn().mockResolvedValue(options.read === false ? null : options.scope ?? {
      user: options.user ?? null,
      allRoadmaps: true,
      roadmapIds: []
    }),
    scopeAllowsRoadmap: vi.fn().mockReturnValue(true)
  }))
  vi.doMock('../lib/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
}

describe('content API handlers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('lists and creates roadmaps with audit', async () => {
    const db = {
      all: vi.fn().mockResolvedValue([{ id: 1, title: 'AWS' }]),
      run: vi.fn().mockResolvedValue({ lastID: 2 }),
      get: vi.fn().mockResolvedValue({ id: 2, title: 'New' })
    }
    await mockApi(db)
    const handler = (await import('../pages/api/roadmaps/index')).default

    const getRes = createResponse()
    await handler(createRequest({ method: 'GET' }), getRes)
    expect(getRes.body).toEqual([{ id: 1, title: 'AWS', category: null, topics: [] }])

    const postRes = createResponse()
    await handler(createRequest({ method: 'POST', body: { title: 'New', description: 'Desc' } }), postRes)
    expect(postRes.statusCode).toBe(201)
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO roadmaps'),
      ['New', 'Desc', null, null, null]
    )
  })

  it('searches roadmaps by normalized module content and keeps private search text out of responses', async () => {
    const db = {
      all: vi.fn().mockResolvedValue([
        {
          id: 2,
          title: 'AWS',
          description: 'Cloud',
          module_count: 2,
          module_search_text: 'Instancias EC2 y redes'
        },
        {
          id: 1,
          title: 'IA para DevOps',
          description: 'Automatizacion',
          module_count: 3,
          module_search_text: 'Evaluación de prompts'
        }
      ])
    }
    await mockApi(db)
    const handler = (await import('../pages/api/roadmaps/index')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { q: 'evaluacion' } }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual([{
      id: 1,
      title: 'IA para DevOps',
      description: 'Automatizacion',
      module_count: 3,
      category: null,
      topics: []
    }])
    expect(db.all).toHaveBeenCalledWith(expect.stringContaining('GROUP_CONCAT'))
  })

  it('combines catalog filters and ordering in the roadmaps API', async () => {
    const db = {
      all: vi.fn().mockResolvedValue([
        {
          id: 1,
          title: 'AWS',
          category_key: 'cloud-y-devops',
          category_label: 'Cloud y DevOps',
          topics_metadata: 'aws\u001fAWS,devops\u001fDevOps',
          module_levels: 'beginner,intermediate',
          duration_weeks_min: 8,
          duration_weeks_max: 10,
          module_search_text: ''
        },
        {
          id: 2,
          title: 'IA',
          category_key: 'inteligencia-artificial',
          topics_metadata: 'devops\u001fDevOps',
          module_levels: 'advanced',
          duration_weeks_min: 20,
          duration_weeks_max: 24,
          module_search_text: ''
        }
      ])
    }
    await mockApi(db)
    const handler = (await import('../pages/api/roadmaps/index')).default

    const res = createResponse()
    await handler(createRequest({
      method: 'GET',
      query: {
        category: 'cloud-y-devops',
        topic: ['aws', 'devops'],
        level: 'beginner',
        duration: '5-to-12',
        sort: 'duration'
      }
    }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual([expect.objectContaining({ id: 1, title: 'AWS' })])
  })

  it('returns filter metadata derived from persisted catalog data', async () => {
    const db = {
      all: vi.fn()
        .mockResolvedValueOnce([{ key: 'cloud-y-devops', label: 'Cloud y DevOps', roadmap_count: 2 }])
        .mockResolvedValueOnce([{ key: 'aws', label: 'AWS', roadmap_count: 1 }])
        .mockResolvedValueOnce([{ key: 'beginner', roadmap_count: 2 }]),
      get: vi.fn()
        .mockResolvedValueOnce({
          min_weeks: 4,
          max_weeks: 24,
          up_to_4_count: 1,
          from_5_to_12_count: 2,
          over_12_count: 3
        })
        .mockResolvedValueOnce({ count: 1 })
    }
    await mockApi(db)
    const handler = (await import('../pages/api/roadmaps/metadata')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET' }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      categories: [{ key: 'cloud-y-devops', label: 'Cloud y DevOps', roadmap_count: 2 }],
      topics: [{ key: 'aws', label: 'AWS', roadmap_count: 1 }],
      duration: { min_weeks: 4, max_weeks: 24 },
      duration_ranges: [
        { key: 'up-to-4', label: 'Hasta 4 semanas', roadmap_count: 1 },
        { key: '5-to-12', label: '5-12 semanas', roadmap_count: 2 },
        { key: 'over-12', label: 'Más de 12 semanas', roadmap_count: 3 }
      ],
      unclassified_roadmaps: 1
    })
    expect(res.body.levels).toEqual(expect.arrayContaining([
      { key: 'beginner', roadmap_count: 2 },
      { key: 'advanced', roadmap_count: 0 }
    ]))
  })

  it('returns empty catalog facets and collections for users without roadmap assignments', async () => {
    const db = { all: vi.fn(), get: vi.fn() }
    await mockApi(db, {
      user,
      scope: { user, allRoadmaps: false, roadmapIds: [] }
    })
    const roadmaps = (await import('../pages/api/roadmaps/index')).default
    const metadata = (await import('../pages/api/roadmaps/metadata')).default
    const modules = (await import('../pages/api/modules/index')).default

    const roadmapsRes = createResponse()
    await roadmaps(createRequest({ method: 'GET' }), roadmapsRes)
    expect(roadmapsRes.body).toEqual([])

    const metadataRes = createResponse()
    await metadata(createRequest({ method: 'GET' }), metadataRes)
    expect(metadataRes.body).toMatchObject({
      categories: [],
      topics: [],
      duration: { min_weeks: null, max_weeks: null },
      unclassified_roadmaps: 0
    })

    const modulesRes = createResponse()
    await modules(createRequest({ method: 'GET' }), modulesRes)
    expect(modulesRes.body).toEqual([])
    expect(db.all).not.toHaveBeenCalled()
  })

  it('validates and persists normalized roadmap metadata on create', async () => {
    const db = {
      all: vi.fn(),
      run: vi.fn()
        .mockResolvedValueOnce({ lastID: 12 })
        .mockResolvedValue({ changes: 1 }),
      get: vi.fn()
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 2 })
        .mockResolvedValueOnce({ id: 3 })
        .mockResolvedValueOnce({ id: 12, title: 'Platform Engineering' })
    }
    await mockApi(db)
    const handler = (await import('../pages/api/roadmaps/index')).default

    const invalid = createResponse()
    await handler(createRequest({
      method: 'POST',
      body: { title: 'Invalid', duration_weeks_min: 8, duration_weeks_max: 2 }
    }), invalid)
    expect(invalid.statusCode).toBe(400)

    const res = createResponse()
    await handler(createRequest({
      method: 'POST',
      body: {
        title: 'Platform Engineering',
        category: 'Cloud y DevOps',
        topics: ['Kubernetes', 'GitOps'],
        duration: '8-10 semanas',
        duration_weeks_min: 8,
        duration_weeks_max: 10
      }
    }), res)

    expect(res.statusCode).toBe(201)
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO roadmap_categories'),
      ['cloud-y-devops', 'Cloud y DevOps']
    )
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO roadmap_topics'),
      [12, 2]
    )
  })

  it('updates roadmap metadata without relying on display text parsing in the client', async () => {
    const db = {
      run: vi.fn()
        .mockResolvedValueOnce({ changes: 1 })
        .mockResolvedValue({ changes: 1 }),
      get: vi.fn()
        .mockResolvedValueOnce({ id: 4 })
        .mockResolvedValueOnce({ id: 8 })
        .mockResolvedValueOnce({ id: 7, title: 'IA actualizada' })
    }
    await mockApi(db)
    const handler = (await import('../pages/api/roadmaps/[id]')).default

    const res = createResponse()
    await handler(createRequest({
      method: 'PUT',
      query: { id: '7' },
      body: {
        title: 'IA actualizada',
        category: 'Inteligencia artificial',
        topics: ['RAG'],
        duration: '12 semanas',
        duration_weeks_min: 10,
        duration_weeks_max: 12
      }
    }), res)

    expect(res.statusCode).toBe(200)
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('duration_weeks_min = CASE'),
      expect.arrayContaining([10, 12, '7'])
    )
  })

  it('reads, updates and deletes a roadmap', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({ id: 1, title: 'AWS' })
        .mockResolvedValueOnce({ id: 1, title: 'AWS Updated' })
        .mockResolvedValueOnce({ title: 'AWS Updated' }),
      all: vi.fn().mockResolvedValue([{ id: 1, title: 'EC2' }]),
      run: vi.fn().mockResolvedValue({ changes: 1 })
    }
    await mockApi(db)
    const handler = (await import('../pages/api/roadmaps/[id]')).default

    const getRes = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '1' } }), getRes)
    expect(getRes.body.modules).toEqual([{ id: 1, title: 'EC2' }])

    const putRes = createResponse()
    await handler(createRequest({ method: 'PUT', query: { id: '1' }, body: { title: 'AWS Updated' } }), putRes)
    expect(putRes.body.title).toBe('AWS Updated')

    const deleteRes = createResponse()
    await handler(createRequest({ method: 'DELETE', query: { id: '1' } }), deleteRes)
    expect(deleteRes.statusCode).toBe(204)
  })

  it('returns personal progress on roadmap detail reads', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({ id: 7, title: 'IA para DevOps' })
        .mockResolvedValueOnce({
          user_id: 2,
          roadmap_id: 7,
          current_module_id: 15,
          current_lesson_id: 42,
          completed_lessons_count: 1,
          time_spent_seconds: 1200,
          completed_at: null
        })
        .mockResolvedValueOnce({
          roadmap_id: 7,
          started_at: '2026-07-01T09:00:00.000Z',
          last_activity_at: '2026-07-16T08:30:00.000Z',
          completed_at: null,
          current_module_id: 15,
          current_module_title: 'Observabilidad',
          current_lesson_id: 42,
          current_lesson_title: 'Evaluacion de prompts'
        }),
      all: vi.fn()
        .mockResolvedValueOnce([
          {
            module_id: 15,
            title: 'Observabilidad',
            position: 1,
            total_lessons: 2,
            completed_lessons_count: 1,
            last_activity_at: '2026-07-06T08:30:00.000Z'
          }
        ])
        .mockResolvedValueOnce([
          {
            lesson_id: 42,
            lesson_title: 'Evaluacion de prompts',
            module_id: 15,
            completed: 1,
            time_spent_seconds: 1200
          },
          {
            lesson_id: 43,
            lesson_title: 'Alertas',
            module_id: 15,
            completed: 0,
            time_spent_seconds: 0
          }
        ])
        .mockResolvedValueOnce([{ id: 15, title: 'Observabilidad' }]),
      run: vi.fn()
    }
    await mockApi(db, { user })
    const handler = (await import('../pages/api/roadmaps/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.progress).toMatchObject({
      roadmap_id: 7,
      progress_percentage: 50,
      next_href: '/modules/15',
      next_step_label: 'Continuar con Alertas'
    })
    expect(res.body.modules[0].progress).toMatchObject({
      module_id: 15,
      status: 'in_progress',
      completed_lessons_count: 1
    })
  })

  it('lists and creates modules', async () => {
    const db = {
      all: vi.fn().mockResolvedValue([{ id: 1, title: 'EC2' }]),
      run: vi.fn().mockResolvedValue({ lastID: 1 }),
      get: vi.fn().mockResolvedValue({ id: 1, title: 'EC2' })
    }
    await mockApi(db)
    const handler = (await import('../pages/api/modules/index')).default

    const getRes = createResponse()
    await handler(createRequest({ method: 'GET', query: { roadmap_id: '1' } }), getRes)
    expect(getRes.body).toEqual([{ id: 1, title: 'EC2' }])

    const postRes = createResponse()
    await handler(createRequest({ method: 'POST', body: { title: 'IAM', roadmap_id: 1 } }), postRes)
    expect(postRes.statusCode).toBe(201)
  })

  it('validates module levels and comparable durations', async () => {
    const db = {
      run: vi.fn().mockResolvedValue({ lastID: 5 }),
      get: vi.fn().mockResolvedValue({ id: 5, title: 'GitOps', level: 'advanced' })
    }
    await mockApi(db)
    const handler = (await import('../pages/api/modules/index')).default

    const invalidLevel = createResponse()
    await handler(createRequest({
      method: 'POST',
      body: { title: 'GitOps', roadmap_id: 1, level: 'expert' }
    }), invalidLevel)
    expect(invalidLevel.statusCode).toBe(400)

    const invalidDuration = createResponse()
    await handler(createRequest({
      method: 'POST',
      body: {
        title: 'GitOps', roadmap_id: 1, level: 'advanced',
        duration_weeks_min: 4, duration_weeks_max: 2
      }
    }), invalidDuration)
    expect(invalidDuration.statusCode).toBe(400)

    const res = createResponse()
    await handler(createRequest({
      method: 'POST',
      body: {
        title: 'GitOps', roadmap_id: 1, level: 'advanced', duration: '2 semanas',
        duration_weeks_min: 2, duration_weeks_max: 2
      }
    }), res)
    expect(res.statusCode).toBe(201)
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO modules'),
      [1, 'GitOps', 'advanced', '2 semanas', 2, 2]
    )
  })

  it('reads, updates and deletes modules', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({ id: 1, title: 'EC2' })
        .mockResolvedValueOnce({ id: 1, title: 'EC2 Updated' })
        .mockResolvedValueOnce({ title: 'EC2 Updated', roadmap_id: 1 }),
      all: vi.fn().mockResolvedValue([{ id: 1, title: 'Lesson' }]),
      run: vi.fn().mockResolvedValue({ changes: 1 })
    }
    await mockApi(db)
    const handler = (await import('../pages/api/modules/[id]')).default

    const getRes = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '1' } }), getRes)
    expect(getRes.body.lessons).toEqual([{ id: 1, title: 'Lesson' }])

    const putRes = createResponse()
    await handler(createRequest({ method: 'PUT', query: { id: '1' }, body: { title: 'EC2 Updated' } }), putRes)
    expect(putRes.body.title).toBe('EC2 Updated')

    const deleteRes = createResponse()
    await handler(createRequest({ method: 'DELETE', query: { id: '1' } }), deleteRes)
    expect(deleteRes.statusCode).toBe(204)
  })

  it('returns personal progress on module detail reads', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({ id: 4, title: 'EC2', roadmap_id: 7 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          attempts_count: 1,
          average_score_percentage: 75,
          best_score_percentage: 75
        })
        .mockResolvedValueOnce({
          score: 3,
          max_score: 4,
          submitted_at: '2026-07-12T08:00:00.000Z'
        }),
      all: vi.fn().mockResolvedValue([
        { id: 9, title: 'SSH basics', completed: 1, progress_time_spent_seconds: 1800 },
        { id: 10, title: 'Instance review', completed: 1, progress_time_spent_seconds: 1800 }
      ]),
      run: vi.fn()
    }
    await mockApi(db, { user })
    const handler = (await import('../pages/api/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '4' } }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.progress).toMatchObject({
      total_lessons: 2,
      completed_lessons_count: 2,
      progress_percentage: 100,
      status: 'completed',
      next_lesson_id: null,
      time_spent_seconds: 3600
    })
    expect(res.body.quiz_summary).toMatchObject({
      attempts_count: 1,
      best_score_percentage: 75,
      latest_attempt: {
        percentage: 75
      }
    })
  })

  it('marks an authenticated module visit as in progress before any lesson is completed', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({ id: 5, title: 'IAM', roadmap_id: 7 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null),
      all: vi.fn().mockResolvedValue([
        { id: 11, title: 'Policies', completed: 0, progress_time_spent_seconds: 0 }
      ]),
      run: vi.fn()
    }
    await mockApi(db, { user })
    const handler = (await import('../pages/api/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '5' } }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.progress).toMatchObject({
      total_lessons: 1,
      completed_lessons_count: 0,
      progress_percentage: 0,
      status: 'in_progress',
      next_lesson_id: 11,
      next_lesson_title: 'Policies'
    })
  })

  it('submits module quiz attempts for authenticated users', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({
          id: 4,
          roadmap_id: 7,
          title: 'EC2',
          contents: '["AMI"]',
          practical_activity: '["Crear instancia"]',
          official_resources: '[{"label":"Amazon EC2"}]'
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          attempts_count: 1,
          average_score_percentage: 100,
          best_score_percentage: 100
        })
        .mockResolvedValueOnce({
          score: 3,
          max_score: 3,
          submitted_at: '2026-07-12T08:00:00.000Z'
        }),
      run: vi.fn()
    }
    await mockApi(db, { user })
    const handler = (await import('../pages/api/quizzes/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({
      method: 'POST',
      query: { id: '4' },
      body: {
        answers: {
          'module-content': 1,
          'module-practice': 2,
          'module-resource': 3
        }
      }
    }), res)

    expect(res.statusCode).toBe(201)
    expect(res.body).toMatchObject({
      max_score: 3,
      summary: {
        attempts_count: 1,
        best_score_percentage: 100
      }
    })
    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_quiz_attempts'), expect.any(Array))
  })

  it('writes lesson progress for authenticated users', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({ lesson_id: 1, title: 'SSH', module_id: 4, roadmap_id: 7 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ time_spent_seconds: 900, completed_lessons_count: 1 })
        .mockResolvedValueOnce({ count: 3 })
        .mockResolvedValueOnce(null),
      run: vi.fn()
    }
    await mockApi(db, { user })
    const handler = (await import('../pages/api/progress/lessons/[id]')).default

    const res = createResponse()
    await handler(createRequest({
      method: 'PUT',
      query: { id: '1' },
      body: { completed: true, time_spent_seconds: 900 }
    }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      lesson_id: 1,
      module_id: 4,
      roadmap_id: 7,
      completed: 1,
      roadmap_completed_lessons_count: 1,
      roadmap_time_spent_seconds: 900
    })
  })

  it('returns roadmap progress summaries for authenticated users', async () => {
    const db = {
      all: vi.fn().mockResolvedValue([
        {
          roadmap_id: 7,
          title: 'IA para DevOps',
          description: 'Ruta aplicada',
          duration: '8 semanas',
          started_at: '2026-07-01T09:00:00.000Z',
          last_activity_at: '2026-07-16T08:30:00.000Z',
          completed_at: null,
          completed_lessons_count: 3,
          time_spent_seconds: 4500,
          current_module_id: 15,
          current_module_title: 'Observabilidad',
          current_lesson_id: 42,
          current_lesson_title: 'Evaluacion de prompts',
          total_modules: 5,
          total_lessons: 8
        }
      ])
    }
    await mockApi(db, { user })
    const handler = (await import('../pages/api/progress/roadmaps')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET' }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject([
      {
        roadmap_id: 7,
        status: 'in_progress',
        progress_percentage: 38,
        next_href: '/modules/15'
      }
    ])
  })

  it('lists and creates lessons', async () => {
    const db = {
      all: vi.fn().mockResolvedValue([{ id: 1, title: 'SSH' }]),
      run: vi.fn().mockResolvedValue({ lastID: 1 }),
      get: vi.fn().mockResolvedValue({ id: 1, title: 'SSH' })
    }
    await mockApi(db)
    const handler = (await import('../pages/api/lessons/index')).default

    const badRes = createResponse()
    await handler(createRequest({ method: 'GET' }), badRes)
    expect(badRes.statusCode).toBe(400)

    const getRes = createResponse()
    await handler(createRequest({ method: 'GET', query: { module_id: '1' } }), getRes)
    expect(getRes.body).toEqual([{ id: 1, title: 'SSH' }])

    const postRes = createResponse()
    await handler(createRequest({ method: 'POST', body: { title: 'SSH', module_id: 1 } }), postRes)
    expect(postRes.statusCode).toBe(201)
  })

  it('reads, updates and deletes lessons', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({ id: 1, title: 'SSH' })
        .mockResolvedValueOnce({ id: 1, title: 'SSH', completed: 1 })
        .mockResolvedValueOnce({ title: 'SSH', module_id: 1 }),
      run: vi.fn().mockResolvedValue({ changes: 1 })
    }
    await mockApi(db)
    const handler = (await import('../pages/api/lessons/[id]')).default

    const getRes = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '1' } }), getRes)
    expect(getRes.body.title).toBe('SSH')

    const putRes = createResponse()
    await handler(createRequest({ method: 'PUT', query: { id: '1' }, body: { title: 'SSH', completed: true } }), putRes)
    expect(putRes.body.completed).toBe(1)

    const deleteRes = createResponse()
    await handler(createRequest({ method: 'DELETE', query: { id: '1' } }), deleteRes)
    expect(deleteRes.statusCode).toBe(204)
  })

  it('returns audit logs to admins', async () => {
    const db = {
      all: vi.fn().mockResolvedValue([{ id: 1, action: 'user.create' }])
    }
    await mockApi(db)
    const handler = (await import('../pages/api/audit-logs/index')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET' }), res)
    expect(res.body).toEqual([{ id: 1, action: 'user.create' }])
  })
})
