import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  API_CONTRACT_VERSION,
  buildOpenApiDocument,
  methodsByPath,
  operations,
  serializeOpenApiDocument
} from '../lib/contracts'
import { createRequest, createResponse } from './helpers/api'

const ROOT = join(__dirname, '..')
const API_DIR = join(ROOT, 'pages', 'api')

/** `pages/api/evidences/[id]/review.ts` -> `/api/evidences/{id}/review`. */
function routeOfFile(file: string) {
  const route = relative(join(ROOT, 'pages'), file)
    .replace(/\.ts$/, '')
    .replace(/\/index$/, '')
    .replace(/\[(\w+)\]/g, '{$1}')
  return `/${route}`
}

function apiFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? apiFiles(join(dir, entry.name)) : [join(dir, entry.name)]
  )
}

describe('route registry', () => {
  it('has an entry for every pages/api file and no entry without a file', () => {
    const filePaths = apiFiles(API_DIR).map(routeOfFile).sort()
    const registryPaths = [...methodsByPath().keys()].sort()

    expect(registryPaths).toEqual(filePaths)
  })

  it('uses unique operation ids and unique method + path pairs', () => {
    const ids = operations.map(op => op.operationId)
    const pairs = operations.map(op => `${op.method} ${op.path}`)

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it('declares every path template variable as a validated path parameter', () => {
    for (const op of operations) {
      const variables = [...op.path.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()
      const declared = Object.keys(op.request.params?.shape ?? {}).sort()
      expect(declared, op.operationId).toEqual(variables)
    }
  })

  it('documents at least one success response per operation', () => {
    for (const op of operations) {
      const statuses = Object.keys(op.responses).map(Number)
      expect(statuses.some(status => status >= 200 && status < 300), op.operationId).toBe(true)
    }
  })
})

describe('OpenAPI document', () => {
  const document = buildOpenApiDocument() as any

  it('matches the committed openapi.json (run `npm run contracts:generate` if this fails)', () => {
    const committed = readFileSync(join(ROOT, 'openapi.json'), 'utf8')

    expect(
      committed === serializeOpenApiDocument(),
      'openapi.json is out of date: run `npm run contracts:generate` and commit the result.'
    ).toBe(true)
  })

  it('is an OpenAPI 3.1 document versioned with the contract version', () => {
    expect(document.openapi).toBe('3.1.0')
    expect(document.info.version).toBe(API_CONTRACT_VERSION)
    expect(API_CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('describes every registry operation with a 405 and a security requirement', () => {
    for (const op of operations) {
      const entry = document.paths[op.path]?.[op.method]
      expect(entry, `${op.method} ${op.path}`).toBeDefined()
      expect(entry.operationId).toBe(op.operationId)
      expect(entry.responses['405']).toBeDefined()
      expect(Array.isArray(entry.security)).toBe(true)
    }
  })

  it('resolves every $ref against components.schemas', () => {
    const text = JSON.stringify(document)
    const refs = [...text.matchAll(/"#\/components\/schemas\/(\w+)"/g)].map(match => match[1])

    expect(refs.length).toBeGreaterThan(0)
    expect(text).not.toContain('#/$defs')
    for (const name of new Set(refs)) {
      expect(document.components.schemas[name], name).toBeDefined()
    }
  })

  it('never leaks the password hash or other secrets into any schema', () => {
    const text = JSON.stringify(document)

    expect(text).not.toContain('password_hash')
    expect(text).not.toContain('token_hash')
  })
})

describe('README endpoint table', () => {
  it('lists every registry operation as `METHOD path`', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')

    for (const op of operations) {
      expect(readme, `${op.method.toUpperCase()} ${op.path}`).toContain(`\`${op.method.toUpperCase()} ${op.path}\``)
    }
  })
})

describe('deprecation', () => {
  it('marks a deprecated operation and tells the replacement', () => {
    const [first] = operations
    const document = buildOpenApiDocument([
      { ...first, deprecated: { since: '1.2.0', sunset: '2027-01-31', replacement: '`GET /api/v2/x`' } }
    ]) as any
    const entry = document.paths[first.path][first.method]

    expect(entry.deprecated).toBe(true)
    expect(entry.description).toContain('**Obsoleta** desde 1.2.0')
    expect(entry.description).toContain('2027-01-31')
    expect(entry.description).toContain('`GET /api/v2/x`')
  })

  it('leaves current operations unmarked', () => {
    for (const entry of Object.values((buildOpenApiDocument() as any).paths)) {
      for (const operation of Object.values(entry as Record<string, any>)) {
        expect(operation.deprecated).toBeUndefined()
      }
    }
  })
})

describe('GET /api/openapi.json', () => {
  it('serves the same document publicly and rejects other methods', async () => {
    const handler = (await import('../pages/api/openapi.json')).default

    const ok = createResponse()
    handler(createRequest({ method: 'GET' }), ok)
    expect(ok.statusCode).toBe(200)
    expect(ok.body).toEqual(JSON.parse(serializeOpenApiDocument()))

    const notAllowed = createResponse()
    handler(createRequest({ method: 'POST' }), notAllowed)
    expect(notAllowed.statusCode).toBe(405)
    expect(notAllowed.headers.Allow).toBe('GET')
    expect(notAllowed.body).toEqual({ error: 'Método no permitido.' })
  })
})
