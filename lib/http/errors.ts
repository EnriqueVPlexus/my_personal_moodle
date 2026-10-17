import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next'

export const INTERNAL_ERROR_MESSAGE = 'Error interno del servidor.'

/** Marks handlers built by `withApiErrors`; `test/api-handler-wrapper.test.ts` requires it on every route. */
export const API_HANDLER_MARKER = Symbol.for('plexus.apiHandler')

export type ApiHandler = NextApiHandler & { [API_HANDLER_MARKER]: true }

export function isApiHandler(value: unknown): value is ApiHandler {
  return typeof value === 'function' && (value as Partial<ApiHandler>)[API_HANDLER_MARKER] === true
}

function routeOf(req: NextApiRequest): string {
  // Path only: the query string can carry tokens or personal data.
  return (typeof req.url === 'string' ? req.url.split('?')[0] : '') || 'unknown'
}

/**
 * Wraps a `pages/api` handler so an unexpected throw (or rejected promise)
 * answers the shared JSON error contract `{ error }` with `500` instead of
 * Next's non-JSON default.
 *
 * - The real error is only logged server-side, with method and route; it never
 *   reaches the response (no message, stack or SQL).
 * - If the handler already sent headers, nothing else is written.
 * - Intentional responses are untouched: only thrown errors are intercepted.
 */
export function withApiErrors(handler: NextApiHandler): ApiHandler {
  const wrapped = async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      return await handler(req, res)
    } catch (error) {
      console.error(`[api] unhandled error in ${req.method ?? 'UNKNOWN'} ${routeOf(req)}`, error)
      if (!res.headersSent) {
        try {
          res.status(500).json({ error: INTERNAL_ERROR_MESSAGE })
        } catch (writeError) {
          console.error('[api] could not write the 500 response', writeError)
        }
      }
    }
  }
  return Object.assign(wrapped, { [API_HANDLER_MARKER]: true as const })
}
