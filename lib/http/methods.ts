import type { NextApiResponse } from 'next'

export const METHOD_NOT_ALLOWED_MESSAGE = 'Método no permitido.'

/**
 * Responds 405 with the shared JSON error contract `{ error }` and the
 * `Allow` header listing the valid methods (e.g. `'GET, POST'`).
 */
export function methodNotAllowed(res: NextApiResponse, allow: string) {
  res.setHeader('Allow', allow)
  return res.status(405).json({ error: METHOD_NOT_ALLOWED_MESSAGE })
}
