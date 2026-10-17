import type { NextApiRequest, NextApiResponse } from 'next'
import { buildOpenApiDocument } from '../../lib/contracts'

/**
 * Serves the API contract. Public on purpose: it only describes routes and
 * schemas (no data, no secrets), and consumers need it before they have a session.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }

  return res.status(200).json(buildOpenApiDocument())
}
