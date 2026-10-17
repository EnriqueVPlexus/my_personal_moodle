import type { NextApiRequest, NextApiResponse } from 'next'
import { withApiErrors } from '../../lib/http/errors'
import { buildOpenApiDocument } from '../../lib/contracts'
import { methodNotAllowed } from '../../lib/http/methods'

/**
 * Serves the API contract. Public on purpose: it only describes routes and
 * schemas (no data, no secrets), and consumers need it before they have a session.
 */
function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, 'GET')
  }

  return res.status(200).json(buildOpenApiDocument())
}

export default withApiErrors(handler)
