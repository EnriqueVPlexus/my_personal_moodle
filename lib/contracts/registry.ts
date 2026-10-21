import { z } from 'zod'
import {
  createLessonBodySchema,
  createModuleBodySchema,
  createRoadmapBodySchema,
  createUserBodySchema,
  evidenceListQuerySchema,
  evidenceModuleQuerySchema,
  evidenceReviewQuerySchema,
  lessonIdQuerySchema,
  lessonListQuerySchema,
  lessonProgressBodySchema,
  lessonProgressQuerySchema,
  loginBodySchema,
  moduleIdQuerySchema,
  moduleListQuerySchema,
  quizAttemptBodySchema,
  quizModuleQuerySchema,
  reviewEvidenceBodySchema,
  roadmapCatalogQuerySchema,
  roadmapIdQuerySchema,
  roadmapImportBodyContractSchema,
  saveEvidenceBodySchema,
  setupBodySchema,
  updateLessonBodySchema,
  updateModuleBodySchema,
  updateRoadmapBodySchema,
  updateUserBodySchema,
  userIdQuerySchema
} from '../validation'
import {
  adminUserListResponseSchema,
  adminUserSchema,
  adminUserWithAccessSchema,
  auditLogEntrySchema,
  dashboardResponseSchema
} from './admin'
import {
  loginResponseSchema,
  logoutResponseSchema,
  meResponseSchema,
  setupRequestExtraSchema,
  setupResponseSchema,
  setupStatusResponseSchema
} from './auth'
import {
  errorBodySchema,
  messageBodySchema,
  importConflictBodySchema,
  quizNotEligibleBodySchema
} from './common'
import {
  catalogMetadataSchema,
  catalogRoadmapSchema,
  importPreviewResponseSchema,
  importResultResponseSchema,
  lessonRecordSchema,
  moduleRecordSchema,
  roadmapDocumentSchema,
  roadmapRecordSchema
} from './content'
import './models'
import {
  evidenceListItemSchema,
  lessonProgressResponseSchema,
  moduleDetailResponseSchema,
  moduleEvidenceResponseSchema,
  moduleEvidenceSchema,
  moduleQuizResponseSchema,
  portfolioResponseSchema,
  quizAttemptResponseSchema,
  roadmapDetailResponseSchema,
  userRoadmapProgressSchema
} from './progress'

/**
 * Route registry: the single description of every `pages/api` endpoint
 * (method, path, auth, request, responses). The OpenAPI document, the shared
 * types and the contract tests are all derived from it.
 *
 * It documents what the API does today; it never drives runtime behavior.
 */

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

/**
 * - `public`: no session needed.
 * - `read`: public unless the server sets `REQUIRE_AUTH_FOR_READS`; with it, a session is required.
 *   Non-admin users with restricted access only see the roadmaps they were granted.
 * - `user`: any signed-in active user.
 * - `admin`: signed-in user with the `admin` role.
 */
export type AuthLevel = 'public' | 'read' | 'user' | 'admin'

export type ContractResponse = {
  description: string
  /** Body schema. Omitted for bodiless responses (204). */
  schema?: z.ZodType
  /** Defaults to `application/json`. */
  contentType?: string
  /** Response headers worth documenting, name -> description. */
  headers?: Record<string, string>
}

export type RequestContract = {
  /** Path parameters (validated from `req.query`). */
  params?: z.ZodObject
  query?: z.ZodObject
  body?: z.ZodType
}

export type ApiOperation = {
  operationId: string
  method: HttpMethod
  /** OpenAPI path template, e.g. `/api/roadmaps/{id}`. */
  path: string
  tag: string
  summary: string
  description?: string
  auth: AuthLevel
  /** Set while the operation is being retired. See `API_CONTRACTS.md`, "Deprecación". */
  deprecated?: { since: string; sunset?: string; replacement?: string }
  request: RequestContract
  /** Every documented status, including the cross-cutting ones added by `operation()`. */
  responses: Record<number, ContractResponse>
}

type OperationInput = Omit<ApiOperation, 'responses' | 'request'> & {
  request?: RequestContract
  responses: Record<number, ContractResponse>
}

const MUTATING = new Set<HttpMethod>(['post', 'put', 'patch', 'delete'])

const json = (description: string, schema: z.ZodType): ContractResponse => ({ description, schema })
const error = (description: string): ContractResponse => ({ description, schema: errorBodySchema })
const noContent = (description: string): ContractResponse => ({ description })

/**
 * Adds the statuses every operation of the same kind shares (400 validation,
 * 401/403 auth, 403 origin, 500 unexpected failure). Explicit entries in
 * `responses` win (e.g. the domain-specific 500 of the create endpoints).
 */
function crossCutting(input: OperationInput): Record<number, ContractResponse> {
  const { auth, method } = input
  const request = input.request ?? {}
  const extra: Record<number, ContractResponse> = {}

  if (request.params || request.query || request.body) {
    extra[400] = error(
      'Datos de entrada no válidos. `error` resume el problema y `issues` lista cada campo con su `path` y `message` (máximo 20).'
    )
  }

  if (auth === 'user' || auth === 'admin') {
    extra[401] = error('No hay sesión válida (`Debes iniciar sesión.`).')
  } else if (auth === 'read') {
    extra[401] = error(
      'Solo si el servidor define `REQUIRE_AUTH_FOR_READS` y no hay sesión válida (`Debes iniciar sesión.`).'
    )
  }

  const forbidden: string[] = []
  if (auth === 'admin') forbidden.push('`Necesitas permisos de administrador.`: el usuario no es administrador.')
  if (MUTATING.has(method)) {
    forbidden.push(
      'Comprobación de origen: `El origen de la petición no es válido.`, `Origen de la petición no permitido.` o `No se pudo comprobar el origen de la petición.` cuando la cabecera `Origin` no coincide con el servidor (o con `ALLOWED_ORIGIN`).'
    )
  }
  if (forbidden.length > 0) extra[403] = error(forbidden.join(' '))

  extra[500] = error(
    'Fallo inesperado (`Error interno del servidor.`). Cuerpo JSON `{ error }` con un texto genérico: el detalle solo se registra en el servidor.'
  )

  return { ...extra, ...input.responses }
}

function operation(input: OperationInput): ApiOperation {
  return { ...input, request: input.request ?? {}, responses: crossCutting(input) }
}

const rateLimited = (limit: string): ContractResponse =>
  error(`Demasiados intentos (${limit}): \`Demasiados intentos. Inténtalo de nuevo más tarde.\`. No se aplica en entorno de test.`)

const notFound = (message: string): ContractResponse => error(`No existe o no es visible para el usuario. Mensaje: \`${message}\`.`)

const attachment = (description: string, contentType: string, schema: z.ZodType): ContractResponse => ({
  description,
  contentType,
  schema,
  headers: { 'Content-Disposition': 'Descarga con `attachment; filename="..."`.' }
})

// Request schemas that extend a validation schema without redefining its rules.
const setupRequestBodySchema = setupBodySchema.extend(setupRequestExtraSchema.shape)

export const operations: ApiOperation[] = [
  // --- Autenticación ---------------------------------------------------------
  operation({
    operationId: 'getSetupStatus',
    method: 'get',
    path: '/api/auth/setup-status',
    tag: 'Autenticación',
    summary: 'Estado de la configuración inicial',
    description: 'Indica si aún no hay usuarios (`needsSetup`) y si la creación del primer administrador exige token.',
    auth: 'public',
    responses: { 200: json('Estado de la configuración inicial.', setupStatusResponseSchema) }
  }),
  operation({
    operationId: 'createFirstAdmin',
    method: 'post',
    path: '/api/auth/setup',
    tag: 'Autenticación',
    summary: 'Crear el primer administrador',
    description:
      'Solo funciona mientras no exista ningún usuario. Abre sesión (cookie `moodle_session`) y registra la acción en la auditoría. ' +
      'El token de configuración se comprueba antes que el origen y la validación del resto del cuerpo.',
    auth: 'public',
    request: { body: setupRequestBodySchema },
    responses: {
      201: json('Administrador creado y sesión iniciada.', setupResponseSchema),
      403: error('`Se requiere el token de configuración inicial.` (token ausente o incorrecto) o error de comprobación de origen.'),
      409: error('La configuración inicial ya se completó (`La configuración inicial ya se completó.`).'),
      429: rateLimited('3 por minuto y dirección IP'),
      500: error('No se pudo crear el usuario (`No se pudo crear el usuario.`).')
    }
  }),
  operation({
    operationId: 'login',
    method: 'post',
    path: '/api/auth/login',
    tag: 'Autenticación',
    summary: 'Iniciar sesión',
    description: 'Con credenciales válidas responde con el usuario y fija la cookie de sesión `moodle_session` (HttpOnly, SameSite=Lax).',
    auth: 'public',
    request: { body: loginBodySchema },
    responses: {
      200: { ...json('Sesión iniciada.', loginResponseSchema), headers: { 'Set-Cookie': 'Cookie de sesión `moodle_session`.' } },
      401: error('Credenciales incorrectas (`Credenciales no válidas.`).'),
      429: rateLimited('5 por minuto y dirección IP')
    }
  }),
  operation({
    operationId: 'logout',
    method: 'post',
    path: '/api/auth/logout',
    tag: 'Autenticación',
    summary: 'Cerrar sesión',
    description: 'Borra la sesión y la cookie. Responde 200 aunque no hubiera sesión.',
    auth: 'public',
    responses: { 200: json('Sesión cerrada.', logoutResponseSchema) }
  }),
  operation({
    operationId: 'getCurrentUser',
    method: 'get',
    path: '/api/auth/me',
    tag: 'Autenticación',
    summary: 'Usuario de la sesión actual',
    description: 'Siempre responde 200: `user` es `null` si no hay sesión válida.',
    auth: 'public',
    responses: { 200: json('Usuario actual o `null`.', meResponseSchema) }
  }),

  // --- Catálogo y contenido --------------------------------------------------
  operation({
    operationId: 'listRoadmaps',
    method: 'get',
    path: '/api/roadmaps',
    tag: 'Catálogo',
    summary: 'Buscar roadmaps del catálogo',
    description:
      'Devuelve los roadmaps visibles para el lector, filtrados y ordenados. Los filtros desconocidos se ignoran. ' +
      'Los parámetros admiten valores repetidos (`?topic=a&topic=b`).',
    auth: 'read',
    request: { query: roadmapCatalogQuerySchema },
    responses: { 200: json('Lista de roadmaps.', z.array(catalogRoadmapSchema)) }
  }),
  operation({
    operationId: 'createRoadmap',
    method: 'post',
    path: '/api/roadmaps',
    tag: 'Catálogo',
    summary: 'Crear un roadmap',
    description: 'Registra `roadmap.create` en la auditoría.',
    auth: 'admin',
    request: { body: createRoadmapBodySchema },
    responses: {
      201: json('Roadmap creado.', roadmapRecordSchema),
      500: error('No se pudo crear el roadmap (`No se pudo crear el roadmap.`).')
    }
  }),
  operation({
    operationId: 'getCatalogMetadata',
    method: 'get',
    path: '/api/roadmaps/metadata',
    tag: 'Catálogo',
    summary: 'Metadatos y contadores de los filtros del catálogo',
    auth: 'read',
    responses: { 200: json('Categorías, temas, niveles, duraciones y estados con su número de roadmaps.', catalogMetadataSchema) }
  }),
  operation({
    operationId: 'importRoadmap',
    method: 'post',
    path: '/api/roadmaps/import',
    tag: 'Catálogo',
    summary: 'Previsualizar o publicar la importación de un roadmap',
    description:
      '`action: preview` valida el documento y devuelve lo normalizado (200). `action: publish` con `strategy: create|update` lo guarda ' +
      '(201 al crear, 200 al actualizar). El documento no puede superar 1 MB. Los errores del documento se devuelven como `issues` con 400.',
    auth: 'admin',
    request: { body: roadmapImportBodyContractSchema },
    responses: {
      200: json(
        'Vista previa (`action: preview`) o resultado de actualizar (`strategy: update`).',
        z.union([importPreviewResponseSchema, importResultResponseSchema])
      ),
      201: json('Roadmap creado (`strategy: create`).', importResultResponseSchema),
      400: error('Cuerpo no válido o roadmap con errores. `issues` indica cada problema del documento (`modules[0].title`...).'),
      409: { description: 'Ya existe (create) o no existe (update) un roadmap con ese título. `code` indica cuál.', schema: importConflictBodySchema },
      413: error('El JSON supera 1 MB (`El JSON no puede superar 1 MB.`).')
    }
  }),
  operation({
    operationId: 'getRoadmap',
    method: 'get',
    path: '/api/roadmaps/{id}',
    tag: 'Catálogo',
    summary: 'Detalle de un roadmap con sus módulos y progreso',
    description: 'Con sesión, registra la visita y añade el progreso del alumno.',
    auth: 'read',
    request: { params: roadmapIdQuerySchema },
    responses: {
      200: json('Detalle del roadmap.', roadmapDetailResponseSchema),
      404: notFound('No encontrado.')
    }
  }),
  operation({
    operationId: 'updateRoadmap',
    method: 'put',
    path: '/api/roadmaps/{id}',
    tag: 'Catálogo',
    summary: 'Actualizar un roadmap',
    description: 'Los campos omitidos conservan su valor. Registra `roadmap.update` en la auditoría.',
    auth: 'admin',
    request: { params: roadmapIdQuerySchema, body: updateRoadmapBodySchema },
    responses: {
      200: json('Roadmap actualizado.', roadmapRecordSchema),
      404: notFound('Roadmap no encontrado.')
    }
  }),
  operation({
    operationId: 'deleteRoadmap',
    method: 'delete',
    path: '/api/roadmaps/{id}',
    tag: 'Catálogo',
    summary: 'Eliminar un roadmap',
    description:
      'Idempotente: nunca responde 404. `204` sin cuerpo si el roadmap existía y se ha borrado (registra `roadmap.delete` en la auditoría); ' +
      '`200` con `{ message }` si no existía (no hay nada que borrar y no se audita).',
    auth: 'admin',
    request: { params: roadmapIdQuerySchema },
    responses: {
      200: json('El roadmap no existía; no había nada que borrar.', messageBodySchema),
      204: noContent('Roadmap borrado.')
    }
  }),
  operation({
    operationId: 'exportRoadmap',
    method: 'get',
    path: '/api/roadmaps/{id}/export',
    tag: 'Catálogo',
    summary: 'Exportar un roadmap como JSON',
    description: 'Copia de seguridad solo para administradores: descarga el documento normalizado, aceptado de nuevo por la importación. Incluye las preguntas de los quizzes con su respuesta correcta (`quiz[].answer`), por eso no es accesible para alumnos.',
    auth: 'admin',
    request: { params: roadmapIdQuerySchema },
    responses: {
      200: attachment('Documento del roadmap (`<slug>.json`).', 'application/json', roadmapDocumentSchema),
      404: notFound('Roadmap no encontrado')
    }
  }),
  operation({
    operationId: 'listModules',
    method: 'get',
    path: '/api/modules',
    tag: 'Catálogo',
    summary: 'Listar módulos',
    description: 'Sin `roadmap_id` devuelve todos los visibles; con él, solo los de ese roadmap (lista vacía si no es visible).',
    auth: 'read',
    request: { query: moduleListQuerySchema },
    responses: { 200: json('Lista de módulos.', z.array(moduleRecordSchema)) }
  }),
  operation({
    operationId: 'createModule',
    method: 'post',
    path: '/api/modules',
    tag: 'Catálogo',
    summary: 'Crear un módulo',
    description: 'Registra `module.create` en la auditoría.',
    auth: 'admin',
    request: { body: createModuleBodySchema },
    responses: { 201: json('Módulo creado.', moduleRecordSchema) }
  }),
  operation({
    operationId: 'getModule',
    method: 'get',
    path: '/api/modules/{id}',
    tag: 'Catálogo',
    summary: 'Detalle de un módulo con lecciones, progreso y cuestionario',
    description:
      '`quiz` es una vista previa estable y pública (nunca incluye las respuestas correctas); para responder hay que usar `GET /api/quizzes/modules/{id}`. ' +
      'Con sesión, registra la visita.',
    auth: 'read',
    request: { params: moduleIdQuerySchema },
    responses: {
      200: json('Detalle del módulo.', moduleDetailResponseSchema),
      404: notFound('No encontrado.')
    }
  }),
  operation({
    operationId: 'updateModule',
    method: 'put',
    path: '/api/modules/{id}',
    tag: 'Catálogo',
    summary: 'Actualizar un módulo',
    description: 'Registra `module.update` en la auditoría.',
    auth: 'admin',
    request: { params: moduleIdQuerySchema, body: updateModuleBodySchema },
    responses: {
      200: json('Módulo actualizado.', moduleRecordSchema),
      404: notFound('Módulo no encontrado.')
    }
  }),
  operation({
    operationId: 'deleteModule',
    method: 'delete',
    path: '/api/modules/{id}',
    tag: 'Catálogo',
    summary: 'Eliminar un módulo',
    auth: 'admin',
    request: { params: moduleIdQuerySchema },
    responses: {
      204: noContent('Eliminado.'),
      404: notFound('Módulo no encontrado.')
    }
  }),
  operation({
    operationId: 'listLessons',
    method: 'get',
    path: '/api/lessons',
    tag: 'Catálogo',
    summary: 'Listar las lecciones de un módulo',
    description: '`module_id` es obligatorio. Lista vacía si el módulo no existe o no es visible.',
    auth: 'read',
    request: { query: lessonListQuerySchema },
    responses: { 200: json('Lecciones del módulo.', z.array(lessonRecordSchema)) }
  }),
  operation({
    operationId: 'createLesson',
    method: 'post',
    path: '/api/lessons',
    tag: 'Catálogo',
    summary: 'Crear una lección',
    description: 'Registra `lesson.create` en la auditoría.',
    auth: 'admin',
    request: { body: createLessonBodySchema },
    responses: { 201: json('Lección creada.', lessonRecordSchema) }
  }),
  operation({
    operationId: 'getLesson',
    method: 'get',
    path: '/api/lessons/{id}',
    tag: 'Catálogo',
    summary: 'Obtener una lección',
    auth: 'read',
    request: { params: lessonIdQuerySchema },
    responses: {
      200: json('Lección.', lessonRecordSchema),
      404: notFound('No encontrado.')
    }
  }),
  operation({
    operationId: 'updateLesson',
    method: 'put',
    path: '/api/lessons/{id}',
    tag: 'Catálogo',
    summary: 'Actualizar una lección',
    description: 'Registra `lesson.update` en la auditoría. Si se omite `completed` se guarda `false`.',
    auth: 'admin',
    request: { params: lessonIdQuerySchema, body: updateLessonBodySchema },
    responses: {
      200: json('Lección actualizada.', lessonRecordSchema),
      404: notFound('Lección no encontrada.')
    }
  }),
  operation({
    operationId: 'deleteLesson',
    method: 'delete',
    path: '/api/lessons/{id}',
    tag: 'Catálogo',
    summary: 'Eliminar una lección',
    auth: 'admin',
    request: { params: lessonIdQuerySchema },
    responses: {
      204: noContent('Eliminada.'),
      404: notFound('Lección no encontrada.')
    }
  }),

  // --- Progreso del alumno ---------------------------------------------------
  operation({
    operationId: 'listRoadmapProgress',
    method: 'get',
    path: '/api/progress/roadmaps',
    tag: 'Progreso',
    summary: 'Progreso del alumno en sus roadmaps',
    auth: 'user',
    responses: { 200: json('Resumen de progreso por roadmap iniciado.', z.array(userRoadmapProgressSchema)) }
  }),
  operation({
    operationId: 'setLessonProgress',
    method: 'put',
    path: '/api/progress/lessons/{id}',
    tag: 'Progreso',
    summary: 'Marcar una lección como completada o pendiente',
    description:
      'Suma `time_spent_seconds` (máximo 30 minutos por llamada). Los parámetros se validan antes de comprobar la sesión: ' +
      'un id no válido responde 400 aunque no haya sesión.',
    auth: 'user',
    request: { params: lessonProgressQuerySchema, body: lessonProgressBodySchema },
    responses: {
      200: json('Progreso de la lección y totales del roadmap.', lessonProgressResponseSchema),
      404: notFound('No encontrado.')
    }
  }),
  operation({
    operationId: 'getModuleQuiz',
    method: 'get',
    path: '/api/quizzes/modules/{id}',
    tag: 'Progreso',
    summary: 'Cuestionario público de un módulo',
    description:
      '`summary`, `eligibility` y `attempt_id` solo se rellenan con sesión; sin ella se devuelve una vista previa estable. ' +
      'Con sesión, el servidor elige hasta 5 preguntas del banco al azar (con las opciones mezcladas) y guarda lo servido en un intento ' +
      'válido 24 horas: recargar devuelve el mismo intento hasta enviarlo o caducar. El cuestionario nunca incluye las respuestas correctas.',
    auth: 'read',
    request: { params: quizModuleQuerySchema },
    responses: {
      200: json('Cuestionario, resumen e idoneidad para un nuevo intento.', moduleQuizResponseSchema),
      404: notFound('No encontrado.')
    }
  }),
  operation({
    operationId: 'submitQuizAttempt',
    method: 'post',
    path: '/api/quizzes/modules/{id}',
    tag: 'Progreso',
    summary: 'Enviar un intento de cuestionario',
    description:
      '`answers` asocia cada `question.id` con el índice de la opción elegida. Hay que responder todas las preguntas del intento. ' +
      '`attempt_id` (opcional) es el intento devuelto por `GET`; se corrige contra lo que se sirvió y solo se puede enviar una vez. ' +
      'Sin `attempt_id` (clientes antiguos) se corrige el cuestionario determinista de siempre, exactamente como antes de la 3.4.0, sin tocar ningún intento. ' +
      'Los parámetros se validan antes de comprobar la sesión.',
    auth: 'user',
    request: { params: quizModuleQuerySchema, body: quizAttemptBodySchema },
    responses: {
      201: json('Intento corregido, con resumen y elegibilidad actualizados.', quizAttemptResponseSchema),
      400: error(
        'Cuerpo no válido (`issues`) o respuestas incompletas/inválidas (`Responde a todas las preguntas del cuestionario con una opción válida.`, sin `issues`).'
      ),
      404: notFound('No encontrado.'),
      409: error('El `attempt_id` no existe, es de otro alumno o módulo, ya se envió o ha caducado (`El intento ya se envió o ha caducado. Recarga el cuestionario para empezar uno nuevo.`).'),
      422: error('El módulo no tiene preguntas de cuestionario (`El módulo no tiene preguntas de cuestionario.`).'),
      429: {
        description: 'Límite de intentos alcanzado o periodo de espera activo. `eligibility` detalla cuándo se puede reintentar.',
        schema: quizNotEligibleBodySchema
      }
    }
  }),

  // --- Evidencias ------------------------------------------------------------
  operation({
    operationId: 'getModuleEvidence',
    method: 'get',
    path: '/api/evidences/modules/{id}',
    tag: 'Evidencias',
    summary: 'Evidencia del alumno para un módulo',
    description: 'Los parámetros se validan antes de comprobar la sesión. `evidence` es `null` si aún no hay entrega.',
    auth: 'user',
    request: { params: evidenceModuleQuerySchema },
    responses: {
      200: json('Evidencia del alumno (o `null`).', moduleEvidenceResponseSchema),
      401: error('Sin sesión (`Debes iniciar sesión.`).'),
      404: notFound('No encontrado.')
    }
  }),
  operation({
    operationId: 'saveModuleEvidence',
    method: 'put',
    path: '/api/evidences/modules/{id}',
    tag: 'Evidencias',
    summary: 'Guardar (crear o reemplazar) la evidencia de un módulo',
    description:
      '`evidence_type` es obligatorio y hace falta al menos una `url` (http/https, máximo 2048) o una `note` (máximo 4000). ' +
      'Los parámetros se validan antes de comprobar la sesión.',
    auth: 'user',
    request: { params: evidenceModuleQuerySchema, body: saveEvidenceBodySchema },
    responses: {
      200: json('Evidencia guardada.', moduleEvidenceResponseSchema),
      404: notFound('No encontrado.')
    }
  }),
  operation({
    operationId: 'deleteModuleEvidence',
    method: 'delete',
    path: '/api/evidences/modules/{id}',
    tag: 'Evidencias',
    summary: 'Eliminar la evidencia del alumno en un módulo',
    description: 'Los parámetros se validan antes de comprobar la sesión. 404 también cuando no había evidencia que borrar.',
    auth: 'user',
    request: { params: evidenceModuleQuerySchema },
    responses: {
      204: noContent('Eliminada.'),
      404: notFound('No encontrado.')
    }
  }),
  operation({
    operationId: 'listEvidences',
    method: 'get',
    path: '/api/evidences',
    tag: 'Evidencias',
    summary: 'Listar evidencias de todos los alumnos (revisión)',
    auth: 'admin',
    request: { query: evidenceListQuerySchema },
    responses: { 200: json('Evidencias, de la más reciente a la más antigua.', z.array(evidenceListItemSchema)) }
  }),
  operation({
    operationId: 'reviewEvidence',
    method: 'put',
    path: '/api/evidences/{id}/review',
    tag: 'Evidencias',
    summary: 'Revisar una evidencia',
    description: 'Registra `evidence.review` en la auditoría.',
    auth: 'admin',
    request: { params: evidenceReviewQuerySchema, body: reviewEvidenceBodySchema },
    responses: {
      200: json('Evidencia revisada.', moduleEvidenceSchema),
      404: notFound('Evidencia no encontrada'),
    }
  }),
  operation({
    operationId: 'getPortfolio',
    method: 'get',
    path: '/api/portfolio',
    tag: 'Evidencias',
    summary: 'Portfolio de evidencias del alumno',
    auth: 'user',
    responses: {
      200: json('Portfolio agrupado por roadmap.', portfolioResponseSchema),
      404: notFound('Usuario no encontrado')
    }
  }),
  operation({
    operationId: 'exportPortfolio',
    method: 'get',
    path: '/api/portfolio/export',
    tag: 'Evidencias',
    summary: 'Exportar el portfolio como Markdown',
    auth: 'user',
    responses: {
      200: attachment('Documento Markdown (`portfolio-<slug>.md`).', 'text/markdown', z.string()),
      404: notFound('Usuario no encontrado')
    }
  }),

  // --- Administración --------------------------------------------------------
  operation({
    operationId: 'getAdminDashboard',
    method: 'get',
    path: '/api/admin/dashboard',
    tag: 'Administración',
    summary: 'Panel de métricas de administración',
    auth: 'admin',
    responses: { 200: json('Métricas de uso y alumnos estancados.', dashboardResponseSchema) }
  }),
  operation({
    operationId: 'listAuditLogs',
    method: 'get',
    path: '/api/audit-logs',
    tag: 'Administración',
    summary: 'Últimos registros de auditoría',
    description: 'Los 200 más recientes, del más nuevo al más antiguo.',
    auth: 'admin',
    responses: { 200: json('Registros de auditoría.', z.array(auditLogEntrySchema)) }
  }),
  operation({
    operationId: 'listUsers',
    method: 'get',
    path: '/api/users',
    tag: 'Administración',
    summary: 'Listar usuarios',
    auth: 'admin',
    responses: { 200: json('Usuarios con los roadmaps a los que tienen acceso.', adminUserListResponseSchema) }
  }),
  operation({
    operationId: 'createUser',
    method: 'post',
    path: '/api/users',
    tag: 'Administración',
    summary: 'Crear un usuario',
    description: 'Un `role` ausente o desconocido se guarda como `user`. Registra `user.create` en la auditoría.',
    auth: 'admin',
    request: { body: createUserBodySchema },
    responses: {
      201: json('Usuario creado, con los mismos campos que en el listado y en `PATCH` (`can_view_all_roadmaps` efectivo y `roadmap_access_ids`, vacío al crearlo).', adminUserWithAccessSchema),
      409: error('Ya existe un usuario con ese correo (`Ya existe un usuario con ese correo electrónico.`).'),
      500: error('No se pudo crear el usuario (`No se pudo crear el usuario.`).')
    }
  }),
  operation({
    operationId: 'updateUser',
    method: 'patch',
    path: '/api/users/{id}',
    tag: 'Administración',
    summary: 'Activar/desactivar, cambiar contraseña o acceso a roadmaps de un usuario',
    description:
      'El campo `action` elige la operación: `set_active`, `reset_password` o `set_roadmap_access`. ' +
      'Desactivar o cambiar la contraseña cierra las sesiones del usuario. La respuesta es siempre el mismo usuario con sus campos de acceso a roadmaps (`can_view_all_roadmaps`, `roadmap_access_ids`), sea cual sea la acción.',
    auth: 'admin',
    request: { params: userIdQuerySchema, body: updateUserBodySchema },
    responses: {
      200: json('Usuario actualizado.', adminUserWithAccessSchema),
      400: error(
        'Cuerpo no válido (`issues`) o regla de negocio incumplida: no desactivarse a uno mismo, no desactivar al último admin activo, ' +
          'los admin tienen acceso total, roadmaps inexistentes (este caso incluye `issues`).'
      ),
      404: notFound('Usuario no encontrado.')
    }
  }),

  // --- Contrato -------------------------------------------------------------
  operation({
    operationId: 'getOpenApiDocument',
    method: 'get',
    path: '/api/openapi.json',
    tag: 'Contrato',
    summary: 'Documento OpenAPI 3.1 de esta API',
    description:
      'Público y de solo lectura: describe rutas y esquemas, no contiene datos ni secretos. Es el mismo contenido que `openapi.json` en la raíz del repositorio.',
    auth: 'public',
    responses: { 200: json('Documento OpenAPI 3.1.', z.object({ openapi: z.string() }).loose()) }
  })
]

/** Every distinct path with the methods it implements (used for the `Allow` header of 405). */
export function methodsByPath(source: readonly ApiOperation[] = operations): Map<string, HttpMethod[]> {
  const map = new Map<string, HttpMethod[]>()
  for (const op of source) {
    map.set(op.path, [...(map.get(op.path) ?? []), op.method])
  }
  return map
}

export const methodNotAllowedResponse: ContractResponse = {
  description: 'Método no admitido (`Método no permitido.`). Cuerpo JSON `{ error }`; la cabecera `Allow` lista los métodos válidos.',
  schema: errorBodySchema,
  headers: { Allow: 'Métodos admitidos en esta ruta, separados por comas.' }
}

export function findOperation(method: string, path: string): ApiOperation | undefined {
  return operations.find(op => op.method === method.toLowerCase() && op.path === path)
}
