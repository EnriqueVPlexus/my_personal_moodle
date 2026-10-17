import { z } from 'zod'
import {
  methodNotAllowedResponse,
  methodsByPath,
  operations,
  type ApiOperation,
  type AuthLevel,
  type ContractResponse
} from './registry'

/**
 * Builds the OpenAPI 3.1 document from the route registry. Everything is
 * derived with Zod's native `z.toJSONSchema`; no extra dependency.
 *
 * - Request schemas use `io: 'input'`: what a client may send (before
 *   transforms).
 * - Response schemas also use `io: 'input'`: they have no transforms or
 *   defaults, and it avoids the `additionalProperties: false` that the
 *   `output` mode would add (clients must ignore unknown fields).
 */

/** Bump on every contract change (semver). See API_CONTRACTS.md, "Versionado". */
export const API_CONTRACT_VERSION = '3.0.0'

const JSON_SCHEMA_OPTIONS = {
  target: 'draft-2020-12',
  io: 'input',
  unrepresentable: 'any'
} as const

type JsonObject = Record<string, unknown>

const SECURITY_BY_AUTH: Record<AuthLevel, JsonObject[]> = {
  public: [],
  read: [{}, { sessionCookie: [] }],
  user: [{ sessionCookie: [] }],
  admin: [{ sessionCookie: [] }]
}

const AUTH_LABEL: Record<AuthLevel, string> = {
  public: 'Pública.',
  read: 'Lectura: pública salvo que el servidor defina `REQUIRE_AUTH_FOR_READS`.',
  user: 'Requiere sesión (cualquier usuario activo).',
  admin: 'Requiere sesión de administrador.'
}

export function authLabel(auth: AuthLevel) {
  return AUTH_LABEL[auth]
}

/** Converts a Zod schema to a JSON Schema fragment plus the named models it references. */
function toSchema(schema: z.ZodType, defs: Record<string, JsonObject>): JsonObject {
  const { $schema: _ignored, $defs, ...rest } = z.toJSONSchema(schema, JSON_SCHEMA_OPTIONS) as JsonObject & {
    $defs?: Record<string, JsonObject>
  }
  for (const [name, definition] of Object.entries($defs ?? {})) {
    const known = defs[name]
    if (known && JSON.stringify(known) !== JSON.stringify(definition)) {
      throw new Error(`The named model "${name}" has two different definitions.`)
    }
    defs[name] = definition
  }
  return rest
}

/** Zod writes `#/$defs/Name`; OpenAPI keeps models under `#/components/schemas/Name`. */
function relocateRefs<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replaceAll('"#/$defs/', '"#/components/schemas/'))
}

function parametersOf(
  location: 'path' | 'query',
  schema: z.ZodObject | undefined,
  defs: Record<string, JsonObject>
): JsonObject[] {
  if (!schema) return []
  const json = toSchema(schema, defs) as { properties?: Record<string, JsonObject>; required?: string[] }
  return Object.entries(json.properties ?? {}).map(([name, property]) => {
    const { description, ...rest } = property as JsonObject & { description?: string }
    return {
      name,
      in: location,
      required: location === 'path' || (json.required ?? []).includes(name),
      ...(description ? { description } : {}),
      schema: rest
    }
  })
}

function responseObject(response: ContractResponse, defs: Record<string, JsonObject>): JsonObject {
  const headers = response.headers
    ? Object.fromEntries(
        Object.entries(response.headers).map(([name, description]) => [name, { description, schema: { type: 'string' } }])
      )
    : undefined
  return {
    description: response.description,
    ...(headers ? { headers } : {}),
    ...(response.schema
      ? { content: { [response.contentType ?? 'application/json']: { schema: toSchema(response.schema, defs) } } }
      : {})
  }
}

function operationObject(op: ApiOperation, allowed: string[], defs: Record<string, JsonObject>): JsonObject {
  const parameters = [...parametersOf('path', op.request.params, defs), ...parametersOf('query', op.request.query, defs)]
  const requestBody = op.request.body
    ? {
        required: true,
        content: { 'application/json': { schema: toSchema(op.request.body, defs) } }
      }
    : undefined

  const responses: Record<string, JsonObject> = {}
  for (const [status, response] of Object.entries(op.responses)) {
    responses[status] = responseObject(response, defs)
  }
  responses['405'] = responseObject(
    {
      ...methodNotAllowedResponse,
      description: `${methodNotAllowedResponse.description} En esta ruta: ${allowed.map(method => method.toUpperCase()).join(', ')}.`
    },
    defs
  )

  const deprecation = op.deprecated
    ? `**Obsoleta** desde ${op.deprecated.since}.` +
      (op.deprecated.sunset ? ` Se retirará a partir de ${op.deprecated.sunset}.` : '') +
      (op.deprecated.replacement ? ` Usa ${op.deprecated.replacement}.` : '')
    : undefined

  return {
    operationId: op.operationId,
    tags: [op.tag],
    summary: op.summary,
    description: [op.description, deprecation, AUTH_LABEL[op.auth]].filter(Boolean).join('\n\n'),
    ...(op.deprecated ? { deprecated: true } : {}),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses,
    security: SECURITY_BY_AUTH[op.auth],
    'x-auth': op.auth
  }
}

const TAG_DESCRIPTIONS: Record<string, string> = {
  'Autenticación': 'Configuración inicial y sesión.',
  'Catálogo': 'Roadmaps, módulos y lecciones.',
  'Progreso': 'Avance del alumno y cuestionarios.',
  'Evidencias': 'Entregas de los alumnos, revisión y portfolio.',
  'Administración': 'Usuarios, auditoría y métricas.',
  'Contrato': 'Descripción de la propia API.'
}

export function buildOpenApiDocument(source: readonly ApiOperation[] = operations): JsonObject {
  const defs: Record<string, JsonObject> = {}
  const allowedByPath = methodsByPath(source)
  const paths: Record<string, Record<string, JsonObject>> = {}

  for (const op of source) {
    paths[op.path] ??= {}
    paths[op.path][op.method] = operationObject(op, allowedByPath.get(op.path) ?? [], defs)
  }

  const sortedSchemas = Object.fromEntries(Object.entries(defs).sort(([a], [b]) => a.localeCompare(b)))
  const tags = [...new Set(source.map(op => op.tag))].map(name => ({ name, description: TAG_DESCRIPTIONS[name] ?? '' }))

  return relocateRefs({
    openapi: '3.1.0',
    info: {
      title: 'Cantera Hub API',
      version: API_CONTRACT_VERSION,
      description:
        'Contrato de la API HTTP de Cantera Hub. Generado desde `lib/contracts` (`npm run contracts:generate`); no editar a mano. ' +
        'Describe el comportamiento actual: los mensajes de error son texto en español salvo los de autenticación, origen y límite de intentos, que están en inglés. ' +
        'Reglas de versionado y compatibilidad: `API_CONTRACTS.md`.'
    },
    servers: [{ url: '/', description: 'Mismo origen que la aplicación.' }],
    tags,
    paths,
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'moodle_session',
          description: 'Cookie de sesión HttpOnly fijada por `POST /api/auth/login` o `POST /api/auth/setup`. Las peticiones que modifican datos deben ser del mismo origen.'
        }
      },
      schemas: sortedSchemas
    }
  })
}

/** Stable text of the document, as committed in `openapi.json`. */
export function serializeOpenApiDocument(): string {
  return `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`
}
