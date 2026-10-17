import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createResponse } from './helpers/api'
import {
  MAX_REPORTED_ISSUES,
  VALIDATION_FALLBACK_MESSAGE,
  formatIssuePath,
  parseOrRespond,
  sendValidationIssues,
  toValidationIssues
} from '../lib/validation/http'
import { bodyObject, emailField, newPasswordField, optionalText, positiveInt, text } from '../lib/validation/primitives'
import { loginBodySchema, setupBodySchema } from '../lib/validation/auth'
import { createUserBodySchema, updateUserBodySchema, userIdQuerySchema } from '../lib/validation/users'
import { createRoadmapBodySchema, updateRoadmapBodySchema } from '../lib/validation/roadmaps'
import { createModuleBodySchema, moduleListQuerySchema, updateModuleBodySchema } from '../lib/validation/modules'
import { createLessonBodySchema, lessonListQuerySchema, updateLessonBodySchema } from '../lib/validation/lessons'
import { lessonProgressBodySchema } from '../lib/validation/progress'
import { quizAttemptBodySchema } from '../lib/validation/quizzes'
import { evidenceListQuerySchema, reviewEvidenceBodySchema, saveEvidenceBodySchema } from '../lib/validation/evidences'
import { roadmapCatalogQuerySchema } from '../lib/validation/catalog'
import { roadmapImportBodySchema } from '../lib/validation/import'

function issuesOf(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input)
  if (result.success) throw new Error('expected the schema to reject the input')
  return toValidationIssues(result.error)
}

function messagesOf(schema: z.ZodType, input: unknown) {
  return issuesOf(schema, input).map(issue => issue.message)
}

describe('validation http helpers', () => {
  it('formats issue paths like the roadmap import issues', () => {
    expect(formatIssuePath([])).toBe('')
    expect(formatIssuePath(['title'])).toBe('title')
    expect(formatIssuePath(['modules', 0, 'title'])).toBe('modules[0].title')
    expect(formatIssuePath([0, 'a'])).toBe('[0].a')
  })

  it('responds 400 with { error, issues } and returns null on invalid input', () => {
    const res = createResponse()
    const parsed = parseOrRespond(bodyObject({ title: text('título', 10) }), { title: '' }, res)

    expect(parsed).toBeNull()
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({
      error: 'El campo «título» no puede estar vacío.',
      issues: [{ path: 'title', message: 'El campo «título» no puede estar vacío.' }]
    })
  })

  it('returns the typed value and does not touch the response when valid', () => {
    const res = createResponse()
    const parsed = parseOrRespond(bodyObject({ title: text('título', 10) }), { title: '  Hola  ' }, res)

    expect(parsed).toEqual({ title: 'Hola' })
    expect(res.status).not.toHaveBeenCalled()
  })

  it('treats a missing body as a validation error instead of throwing', () => {
    const res = createResponse()
    expect(parseOrRespond(bodyObject({ title: text('título', 10) }), undefined, res)).toBeNull()
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('El cuerpo de la petición debe ser un objeto JSON.')
  })

  it('caps the number of reported issues and never leaks internals', () => {
    const schema = z.array(z.string({ error: 'Debe ser texto.' }))
    const result = schema.safeParse(Array.from({ length: 50 }, () => 1))
    expect(result.success).toBe(false)
    const issues = toValidationIssues((result as { error: z.ZodError }).error)
    expect(issues).toHaveLength(MAX_REPORTED_ISSUES)
    expect(issues[0]).toEqual({ path: '[0]', message: 'Debe ser texto.' })
  })

  it('uses a summary override and falls back to a generic Spanish message', () => {
    const res = createResponse()
    sendValidationIssues(res, [{ path: 'a', message: 'Detalle.' }], 'Resumen.')
    expect(res.body).toEqual({ error: 'Resumen.', issues: [{ path: 'a', message: 'Detalle.' }] })

    const empty = createResponse()
    sendValidationIssues(empty, [])
    expect(empty.body).toEqual({ error: VALIDATION_FALLBACK_MESSAGE })
  })

  it('falls back to the Spanish locale for issues without a custom message', () => {
    const [issue] = issuesOf(z.object({ n: z.number() }), { n: 'x' })
    expect(issue.path).toBe('n')
    expect(issue.message).not.toMatch(/Invalid input/)
  })
})

describe('validation primitives', () => {
  const idSchema = z.object({ id: positiveInt('id') })

  it('accepts positive integer ids from numbers, strings and repeated query values', () => {
    expect(idSchema.parse({ id: '5' })).toEqual({ id: 5 })
    expect(idSchema.parse({ id: 5 })).toEqual({ id: 5 })
    expect(idSchema.parse({ id: ['7', '8'] })).toEqual({ id: 7 })
    expect(idSchema.parse({ id: String(Number.MAX_SAFE_INTEGER) })).toEqual({ id: Number.MAX_SAFE_INTEGER })
  })

  it.each(['0', '-1', '1.5', 'abc', '1e3', '12abc', '9007199254740993', ' ', 0, -3, 2.5, true, {}])(
    'rejects the id %j',
    value => {
      expect(messagesOf(idSchema, { id: value })).toEqual(['El campo «id» debe ser un número entero positivo.'])
    }
  )

  it('reports missing ids separately', () => {
    expect(messagesOf(idSchema, {})).toEqual(['Falta el campo «id».'])
    expect(messagesOf(idSchema, { id: null })).toEqual(['Falta el campo «id».'])
    expect(messagesOf(idSchema, { id: '' })).toEqual(['Falta el campo «id».'])
  })

  it('enforces text trimming and max length boundaries', () => {
    const schema = z.object({ title: text('título', 5), note: optionalText('nota', 3) })
    expect(schema.parse({ title: ' abcde ' })).toEqual({ title: 'abcde' })
    expect(messagesOf(schema, { title: 'abcdef' })).toEqual(['El campo «título» no puede superar 5 caracteres.'])
    expect(messagesOf(schema, { title: '   ' })).toEqual(['El campo «título» no puede estar vacío.'])
    expect(messagesOf(schema, { title: 5 })).toEqual(['El campo «título» debe ser un texto.'])
    expect(messagesOf(schema, {})).toEqual(['Falta el campo «título».'])
    expect(schema.parse({ title: 'a', note: null })).toEqual({ title: 'a', note: null })
    expect(schema.parse({ title: 'a', note: '' })).toEqual({ title: 'a', note: '' })
    expect(messagesOf(schema, { title: 'a', note: 'abcd' })).toEqual(['El campo «nota» no puede superar 3 caracteres.'])
  })

  it('validates and normalizes emails with the shared normalizer', () => {
    expect(emailField.parse('  USER@Example.COM ')).toBe('user@example.com')
    expect(messagesOf(emailField, 'not-an-email')).toEqual(['El correo electrónico no es válido.'])
    expect(messagesOf(emailField, '')).toEqual(['El campo «correo electrónico» no puede estar vacío.'])
    expect(messagesOf(emailField, `${'a'.repeat(250)}@x.es`)).toEqual(['El campo «correo electrónico» no puede superar 254 caracteres.'])
  })

  it('reuses validatePassword for password boundaries', () => {
    expect(newPasswordField.parse('a'.repeat(12))).toBe('a'.repeat(12))
    expect(newPasswordField.parse('a'.repeat(256))).toBe('a'.repeat(256))
    expect(messagesOf(newPasswordField, 'a'.repeat(11))).toEqual(['La contraseña debe tener al menos 12 caracteres.'])
    expect(messagesOf(newPasswordField, 'a'.repeat(257))).toEqual(['La contraseña es demasiado larga.'])
    expect(messagesOf(newPasswordField, ' '.repeat(12))).toEqual(['La contraseña no puede estar vacía.'])
    expect(messagesOf(newPasswordField, undefined)).toEqual(['Falta el campo «contraseña».'])
  })
})

describe('auth schemas', () => {
  it('keeps login lenient on email format and never trims passwords', () => {
    expect(loginBodySchema.parse({ email: ' admin ', password: ' pass ' })).toEqual({ email: 'admin', password: ' pass ' })
    expect(issuesOf(loginBodySchema, {}).map(issue => issue.path)).toEqual(['email', 'password'])
    expect(messagesOf(loginBodySchema, { email: 'a', password: 'p'.repeat(257) })).toEqual(['La contraseña es demasiado larga.'])
  })

  it('validates the setup payload and normalizes the name', () => {
    expect(setupBodySchema.parse({ email: 'A@B.ES', name: '  Ana ', password: 'valid-password-123' })).toEqual({
      email: 'a@b.es',
      name: 'Ana',
      password: 'valid-password-123'
    })
    expect(setupBodySchema.parse({ email: 'a@b.es', password: 'valid-password-123' }).name).toBeUndefined()
    expect(issuesOf(setupBodySchema, { email: 'nope', password: 'short' }).map(issue => issue.path)).toEqual(['email', 'password'])
    expect(messagesOf(setupBodySchema, { email: 'a@b.es', password: 'valid-password-123', name: 'n'.repeat(121) }))
      .toEqual(['El campo «nombre» no puede superar 120 caracteres.'])
  })
})

describe('users schemas', () => {
  it('defaults unknown roles to user and keeps admin', () => {
    const base = { email: 'a@b.es', password: 'valid-password-123' }
    expect(createUserBodySchema.parse({ ...base, role: 'admin' }).role).toBe('admin')
    expect(createUserBodySchema.parse({ ...base, role: 'owner' }).role).toBe('user')
    expect(createUserBodySchema.parse(base).role).toBeUndefined()
  })

  it('validates the user id query', () => {
    expect(userIdQuerySchema.parse({ id: '3' })).toEqual({ id: 3 })
    expect(messagesOf(userIdQuerySchema, { id: '0' })).toEqual(['El campo «id» debe ser un número entero positivo.'])
    expect(messagesOf(userIdQuerySchema, undefined)).toEqual(['Los parámetros de la petición no son válidos.'])
  })

  it('discriminates PATCH actions and requires strict booleans', () => {
    expect(updateUserBodySchema.parse({ action: 'set_active', is_active: false })).toEqual({ action: 'set_active', is_active: false })
    expect(messagesOf(updateUserBodySchema, { action: 'set_active' })).toEqual(['Falta el campo «is_active».'])
    expect(messagesOf(updateUserBodySchema, { action: 'set_active', is_active: 'false' })).toEqual(['El campo «is_active» debe ser verdadero o falso.'])
    expect(messagesOf(updateUserBodySchema, { action: 'rename' })).toEqual(['Acción no admitida.'])
    expect(messagesOf(updateUserBodySchema, {})).toEqual(['Acción no admitida.'])
    expect(messagesOf(updateUserBodySchema, undefined)).toEqual(['Acción no admitida.'])
    expect(messagesOf(updateUserBodySchema, { action: 'reset_password', password: 'short' })).toEqual(['La contraseña debe tener al menos 12 caracteres.'])
  })

  it('normalizes and deduplicates roadmap ids for access updates', () => {
    expect(updateUserBodySchema.parse({
      action: 'set_roadmap_access',
      can_view_all_roadmaps: false,
      roadmap_ids: [1, '2', 2]
    })).toEqual({ action: 'set_roadmap_access', can_view_all_roadmaps: false, roadmap_ids: [1, 2] })
    expect(issuesOf(updateUserBodySchema, {
      action: 'set_roadmap_access',
      can_view_all_roadmaps: false,
      roadmap_ids: [1, 0]
    })[0]).toEqual({ path: 'roadmap_ids[1]', message: 'El campo «roadmap_ids» debe ser un número entero positivo.' })
    expect(messagesOf(updateUserBodySchema, {
      action: 'set_roadmap_access',
      can_view_all_roadmaps: false,
      roadmap_ids: Array.from({ length: 1001 }, (_, index) => index + 1)
    })).toEqual(['No se pueden asignar más de 1000 roadmaps.'])
  })
})

describe('roadmap schemas', () => {
  it('applies defaults on create and reuses the metadata normalizers', () => {
    const parsed = createRoadmapBodySchema.parse({
      title: ' AWS ',
      topics: 'Cloud, cloud,  IAM ',
      duration: '3 semanas'
    })
    expect(parsed).toMatchObject({
      title: 'AWS',
      topics: ['Cloud', 'IAM'],
      durationWeeks: { min: 3, max: 3 },
      version: 'v1.0.0'
    })
    expect(Number.isNaN(Date.parse(parsed.publishedAt))).toBe(false)
  })

  it('prefers explicit week bounds and accepts empty form values', () => {
    expect(createRoadmapBodySchema.parse({ title: 'x', duration_weeks_min: '2', duration_weeks_max: '6' }).durationWeeks)
      .toEqual({ min: 2, max: 6 })
    expect(createRoadmapBodySchema.parse({ title: 'x', duration_weeks_min: '', duration_weeks_max: '', topics: '' }).durationWeeks)
      .toEqual({ min: null, max: null })
  })

  it('rejects invalid durations, versions and dates', () => {
    const issues = issuesOf(createRoadmapBodySchema, {
      title: 'x',
      duration_weeks_min: 9,
      duration_weeks_max: 2,
      version: '1.0',
      published_at: 'not-a-date'
    })
    expect(issues.map(issue => issue.path)).toEqual(['duration_weeks_min', 'version', 'published_at'])
    expect(messagesOf(createRoadmapBodySchema, { title: 'x', duration_weeks_min: -1 }))
      .toEqual(['El rango de duración en semanas no es válido.'])
  })

  it('enforces title, description and topic limits at the boundary', () => {
    expect(createRoadmapBodySchema.safeParse({ title: 't'.repeat(200) }).success).toBe(true)
    expect(messagesOf(createRoadmapBodySchema, { title: 't'.repeat(201) })).toEqual(['El campo «título» no puede superar 200 caracteres.'])
    expect(createRoadmapBodySchema.safeParse({ title: 'x', description: 'd'.repeat(5000) }).success).toBe(true)
    expect(messagesOf(createRoadmapBodySchema, { title: 'x', description: 'd'.repeat(5001) })).toEqual(['El campo «descripción» no puede superar 5000 caracteres.'])

    const twenty = Array.from({ length: 20 }, (_, index) => `tema ${index}`)
    expect(createRoadmapBodySchema.safeParse({ title: 'x', topics: twenty }).success).toBe(true)
    expect(messagesOf(createRoadmapBodySchema, { title: 'x', topics: [...twenty, 'otro'] }))
      .toEqual(['Un roadmap puede tener como máximo 20 temas.'])
    expect(messagesOf(createRoadmapBodySchema, { title: 'x', topics: ['t'.repeat(101)] }))
      .toEqual(['Cada tema no puede superar 100 caracteres.'])
    expect(messagesOf(createRoadmapBodySchema, { title: 'x', topics: { a: 1 } }))
      .toEqual(['El campo «temas» debe ser una lista de textos.'])
  })

  it('leaves omitted fields untouched on update', () => {
    const parsed = updateRoadmapBodySchema.parse({ title: 'x' })
    expect(parsed.durationWeeks).toBeUndefined()
    expect(parsed.version).toBeUndefined()
    expect(parsed.publishedAt).toBeUndefined()
    expect(parsed.topics).toBeUndefined()
    expect(parsed.category).toBeUndefined()

    expect(updateRoadmapBodySchema.parse({ title: 'x', duration: '2 meses' }).durationWeeks).toEqual({ min: 8, max: 8 })
    expect(updateRoadmapBodySchema.parse({ title: 'x', duration_weeks_max: 4 }).durationWeeks).toEqual({ min: null, max: 4 })
    expect(updateRoadmapBodySchema.parse({ title: 'x', version: ' v2.1.0 ' }).version).toBe('v2.1.0')
    expect(messagesOf(updateRoadmapBodySchema, { title: 'x', version: 'nope' })).toEqual(['La versión del roadmap no es válida (formato v1.0.0).'])
    expect(messagesOf(updateRoadmapBodySchema, undefined)).toEqual(['El cuerpo de la petición debe ser un objeto JSON.'])
    expect(messagesOf(updateRoadmapBodySchema, { title: ['x'] })).toEqual(['El campo «título» debe ser un texto.'])
  })
})

describe('module schemas', () => {
  it('requires roadmap_id and normalizes levels on create', () => {
    expect(createModuleBodySchema.parse({ title: 'M', roadmap_id: '4', level: 'beginner-intermediate' })).toMatchObject({
      title: 'M',
      roadmap_id: 4,
      level: 'intermediate',
      durationWeeks: { min: null, max: null }
    })
    expect(createModuleBodySchema.parse({ title: 'M', roadmap_id: 1, level: '' }).level).toBeNull()
    expect(createModuleBodySchema.parse({ title: 'M', roadmap_id: 1 }).level).toBeNull()
    expect(messagesOf(createModuleBodySchema, { title: 'M' })).toEqual(['Falta el campo «roadmap_id».'])
    expect(messagesOf(createModuleBodySchema, { title: 'M', roadmap_id: 1, level: 'expert' })).toEqual(['El nivel del módulo no es válido.'])
    expect(messagesOf(createModuleBodySchema, { title: 'M', roadmap_id: 1, duration_weeks_min: 5, duration_weeks_max: 1 }))
      .toEqual(['El rango de duración en semanas no es válido.'])
  })

  it('distinguishes omitted from empty fields on update', () => {
    const omitted = updateModuleBodySchema.parse({ title: 'M' })
    expect(omitted.level).toBeUndefined()
    expect(omitted.duration).toBeUndefined()
    expect(omitted.durationWeeks).toBeUndefined()

    const cleared = updateModuleBodySchema.parse({ title: 'M', level: null, duration: '' })
    expect(cleared.level).toBeNull()
    expect(cleared.duration).toBe('')
    expect(cleared.durationWeeks).toEqual({ min: null, max: null })
    expect(updateModuleBodySchema.parse({ title: 'M', duration: '2-4 semanas' }).durationWeeks).toEqual({ min: 2, max: 4 })
  })

  it('validates the optional roadmap_id list filter', () => {
    expect(moduleListQuerySchema.parse({})).toEqual({})
    expect(moduleListQuerySchema.parse({ roadmap_id: '3' })).toEqual({ roadmap_id: 3 })
    expect(moduleListQuerySchema.parse({ roadmap_id: '' })).toEqual({})
    expect(messagesOf(moduleListQuerySchema, { roadmap_id: 'abc' })).toEqual(['El campo «roadmap_id» debe ser un número entero positivo.'])
  })
})

describe('lesson schemas', () => {
  it('validates lesson creation', () => {
    expect(createLessonBodySchema.parse({ title: ' Intro ', module_id: '2' })).toEqual({ title: 'Intro', module_id: 2 })
    expect(issuesOf(createLessonBodySchema, {}).map(issue => issue.path)).toEqual(['title', 'module_id'])
    expect(messagesOf(createLessonBodySchema, { title: 't'.repeat(201), module_id: 1 })).toEqual(['El campo «título» no puede superar 200 caracteres.'])
  })

  it('type-checks title and completed on update', () => {
    expect(updateLessonBodySchema.parse({ title: 'x', completed: true })).toEqual({ title: 'x', completed: true })
    expect(updateLessonBodySchema.parse({ title: 'x' }).completed).toBeUndefined()
    expect(messagesOf(updateLessonBodySchema, { title: 42 })).toEqual(['El campo «título» debe ser un texto.'])
    expect(messagesOf(updateLessonBodySchema, { title: 'x', completed: 'yes' })).toEqual(['El campo «completed» debe ser verdadero o falso.'])
    expect(messagesOf(updateLessonBodySchema, undefined)).toEqual(['El cuerpo de la petición debe ser un objeto JSON.'])
  })

  it('requires module_id for listing', () => {
    expect(lessonListQuerySchema.parse({ module_id: '9' })).toEqual({ module_id: 9 })
    expect(messagesOf(lessonListQuerySchema, {})).toEqual(['Falta el campo «module_id».'])
    expect(messagesOf(lessonListQuerySchema, { module_id: '' })).toEqual(['Falta el campo «module_id».'])
  })
})

describe('progress schema', () => {
  it.each([[true, true], [1, true], ['1', true], [false, false], [0, false], ['0', false]])(
    'accepts completed=%j',
    (input, expected) => {
      expect(lessonProgressBodySchema.parse({ completed: input }).completed).toBe(expected)
    }
  )

  it('rejects non boolean-like completed values', () => {
    expect(messagesOf(lessonProgressBodySchema, { completed: 'maybe' })).toEqual(['El campo «completed» debe ser verdadero o falso.'])
    expect(messagesOf(lessonProgressBodySchema, {})).toEqual(['El campo «completed» debe ser verdadero o falso.'])
    expect(messagesOf(lessonProgressBodySchema, undefined)).toEqual(['El cuerpo de la petición debe ser un objeto JSON.'])
  })

  it('rounds, clamps and validates time_spent_seconds', () => {
    expect(lessonProgressBodySchema.parse({ completed: true }).time_spent_seconds).toBeUndefined()
    expect(lessonProgressBodySchema.parse({ completed: true, time_spent_seconds: '12.6' }).time_spent_seconds).toBe(13)
    expect(lessonProgressBodySchema.parse({ completed: true, time_spent_seconds: 0 }).time_spent_seconds).toBe(0)
    expect(lessonProgressBodySchema.parse({ completed: true, time_spent_seconds: 999999 }).time_spent_seconds).toBe(1800)
    for (const invalid of [-1, 'abc', '', Number.NaN, Number.POSITIVE_INFINITY, null, {}]) {
      expect(messagesOf(lessonProgressBodySchema, { completed: true, time_spent_seconds: invalid }))
        .toEqual(['El campo «time_spent_seconds» debe ser un número no negativo.'])
    }
  })
})

describe('quiz schema', () => {
  it('requires an answers object and rejects arrays', () => {
    expect(quizAttemptBodySchema.parse({ answers: { a: 1 } })).toEqual({ answers: { a: 1 } })
    expect(quizAttemptBodySchema.parse({ answers: {} })).toEqual({ answers: {} })
    for (const body of [{}, { answers: [] }, { answers: 'x' }, { answers: null }, undefined]) {
      expect(quizAttemptBodySchema.safeParse(body).success).toBe(false)
    }
  })

  it('limits the number of answers', () => {
    const answers = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, index) => [`q${index}`, 0]))
    expect(quizAttemptBodySchema.safeParse({ answers: answers(200) }).success).toBe(true)
    expect(messagesOf(quizAttemptBodySchema, { answers: answers(201) })).toEqual(['No se pueden enviar más de 200 respuestas.'])
  })
})

describe('evidence schemas', () => {
  it('adapts validateEvidenceInput to the shared contract', () => {
    expect(saveEvidenceBodySchema.parse({ evidence_type: 'github', url: ' https://github.com/x/y ' })).toEqual({
      evidenceType: 'github',
      url: 'https://github.com/x/y',
      note: null
    })
    expect(issuesOf(saveEvidenceBodySchema, { evidence_type: 'file', note: 'x' })).toEqual([
      { path: 'evidence_type', message: 'El tipo de evidencia no es válido.' }
    ])
    expect(issuesOf(saveEvidenceBodySchema, { evidence_type: 'demo', url: 'ftp://x.es' })).toEqual([
      { path: 'url', message: 'La URL debe usar http o https.' }
    ])
    expect(messagesOf(saveEvidenceBodySchema, { evidence_type: 'note', note: 'n'.repeat(4001) })).toEqual(['La nota no puede superar 4000 caracteres.'])
    expect(saveEvidenceBodySchema.safeParse({ evidence_type: 'note', note: 'n'.repeat(4000) }).success).toBe(true)
    expect(messagesOf(saveEvidenceBodySchema, { evidence_type: 'note' })).toEqual(['Indica una URL o una nota.'])
    expect(messagesOf(saveEvidenceBodySchema, undefined)).toEqual(['El cuerpo de la petición debe ser un objeto JSON.'])
  })

  it('validates review payloads', () => {
    expect(reviewEvidenceBodySchema.parse({ review_status: 'aprobado', admin_comment: null })).toEqual({ review_status: 'aprobado', admin_comment: null })
    expect(messagesOf(reviewEvidenceBodySchema, { review_status: 'x' })).toEqual(['El estado de revisión no es válido.'])
    expect(messagesOf(reviewEvidenceBodySchema, { review_status: 'aprobado', admin_comment: 1 })).toEqual(['El campo «comentario del administrador» debe ser un texto.'])
    expect(messagesOf(reviewEvidenceBodySchema, { review_status: 'aprobado', admin_comment: 'c'.repeat(2001) })).toEqual(['El campo «comentario del administrador» no puede superar 2000 caracteres.'])
  })

  it('validates list filters and ignores unknown statuses', () => {
    expect(evidenceListQuerySchema.parse({ user_id: ['5'], status: 'aprobado' })).toEqual({ user_id: 5, status: 'aprobado' })
    expect(evidenceListQuerySchema.parse({ status: 'weird' }).status).toBeUndefined()
    expect(messagesOf(evidenceListQuerySchema, { module_id: ['0'] })).toEqual(['El campo «module_id» debe ser un número entero positivo.'])
  })
})

describe('catalog query schema', () => {
  it('accepts the documented filters and repeated values', () => {
    expect(roadmapCatalogQuerySchema.safeParse({ q: 'aws', category: 'cloud', topic: ['a', 'b'], sort: 'title' }).success).toBe(true)
    expect(roadmapCatalogQuerySchema.safeParse({}).success).toBe(true)
  })

  it('limits the search query after whitespace normalization', () => {
    expect(roadmapCatalogQuerySchema.safeParse({ q: 'a'.repeat(100) }).success).toBe(true)
    expect(messagesOf(roadmapCatalogQuerySchema, { q: 'a'.repeat(101) })).toEqual(['La búsqueda no puede superar 100 caracteres.'])
    expect(roadmapCatalogQuerySchema.safeParse({ q: `${'a '.repeat(50)}${' '.repeat(40)}` }).success).toBe(true)
  })

  it('rejects oversized or non text filters', () => {
    expect(roadmapCatalogQuerySchema.safeParse({ topic: 't'.repeat(501) }).success).toBe(false)
    expect(roadmapCatalogQuerySchema.safeParse({ topic: Array.from({ length: 51 }, () => 'a') }).success).toBe(false)
    expect(roadmapCatalogQuerySchema.safeParse({ topic: { a: 1 } }).success).toBe(false)
  })
})

describe('import schema', () => {
  it('validates the envelope and requires a strategy to publish', () => {
    expect(roadmapImportBodySchema.safeParse({ action: 'preview', roadmap: {} }).success).toBe(true)
    expect(roadmapImportBodySchema.safeParse({ action: 'publish', strategy: 'update', roadmap: {} }).success).toBe(true)
    expect(issuesOf(roadmapImportBodySchema, { action: 'publish', roadmap: {} })).toEqual([
      { path: 'strategy', message: 'La estrategia debe ser create o update.' }
    ])
    expect(messagesOf(roadmapImportBodySchema, { action: 'publish', strategy: 'replace' })).toEqual(['La estrategia debe ser create o update.'])
    expect(messagesOf(roadmapImportBodySchema, { action: 'wrong' })).toEqual(['Acción de importación no válida.'])
    expect(messagesOf(roadmapImportBodySchema, undefined)).toEqual(['El cuerpo de la petición debe ser un objeto JSON.'])
  })
})

describe('error contract invariants', () => {
  it('never includes stack traces or raw exception text', () => {
    const res = createResponse()
    parseOrRespond(createRoadmapBodySchema, { title: 5 }, res)
    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toMatch(/stack|ZodError|at .*\(/)
    expect(Object.keys(res.body).sort()).toEqual(['error', 'issues'])
  })
})
