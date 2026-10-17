/**
 * Public API of the contracts layer. Handlers, the UI and the tests import
 * from here; domains never do (see ARCHITECTURE.md).
 */
export * from './common'
export * from './auth'
export * from './content'
export * from './progress'
export * from './admin'
export * from './registry'
export { API_CONTRACT_VERSION, authLabel, buildOpenApiDocument, serializeOpenApiDocument } from './openapi'
