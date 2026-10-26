import type { NextApiRequest, NextApiResponse } from 'next'
import { withApiErrors } from '../../../../lib/http/errors'
import { createServices } from '../../../../lib/container'
import { requireUser } from '../../../../lib/http/auth'
import { openDb } from '../../../../lib/persistence'
import { methodNotAllowed } from '../../../../lib/http/methods'
import { parseOrRespond } from '../../../../lib/validation/http'
import { quizAttemptsExportQuerySchema } from '../../../../lib/validation/progress'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, 'GET')
  }

  const query = parseOrRespond(quizAttemptsExportQuerySchema, req.query, res)
  if (!query) return
  const format = query.format ?? 'json'

  const db = await openDb()
  const user = await requireUser(req, res, db)
  if (!user) return

  // Only the session user's attempts: the query has no user parameter.
  const { progress } = createServices(db)
  const data = await progress.exportQuizResults(user)
  const exportedAt = new Date(data.exported_at)
  const filename = progress.quizResultsFilename(exportedAt, format)

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Cache-Control', 'no-store')
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    return res.status(200).end(progress.quizResultsToCsv(data))
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  return res.status(200).json(data)
}

export default withApiErrors(handler)
