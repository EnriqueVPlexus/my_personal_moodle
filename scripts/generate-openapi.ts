import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { serializeOpenApiDocument } from '../lib/contracts'

/** Writes the OpenAPI document derived from the route registry to `openapi.json`. */
const target = join(__dirname, '..', 'openapi.json')
writeFileSync(target, serializeOpenApiDocument())
console.log(`OpenAPI document written to ${target}`)
