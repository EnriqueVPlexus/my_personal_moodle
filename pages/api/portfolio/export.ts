import type { NextApiRequest, NextApiResponse } from 'next'
import { createServices } from '../../../lib/container'
import { requireUser } from '../../../lib/http/auth'
import { openDb } from '../../../lib/persistence'
import { normalizeMetadataKey } from '../../../lib/domains/content/metadata'
import { methodNotAllowed } from '../../../lib/http/methods'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, 'GET')
  }

  const db = await openDb()
  const user = await requireUser(req, res, db)
  if (!user) return

  const { progress } = createServices(db)
  const portfolio = await progress.getPortfolio(user.id)
  if (!portfolio) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  const markdownContent = progress.exportPortfolioMarkdown(portfolio)
  const slug = normalizeMetadataKey(portfolio.user.name || portfolio.user.email) || `user-${portfolio.user.id}`
  const filename = `portfolio-${slug}.md`

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  return res.status(200).end(markdownContent)
}
