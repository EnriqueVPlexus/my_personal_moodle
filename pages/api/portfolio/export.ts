import type { NextApiRequest, NextApiResponse } from 'next'
import { requireUser } from '../../../lib/auth'
import { openDb } from '../../../lib/db'
import { exportPortfolioAsMarkdown, getUserPortfolio } from '../../../lib/portfolio'
import { normalizeMetadataKey } from '../../../lib/roadmapMetadata'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }

  const db = await openDb()
  const user = await requireUser(req, res, db)
  if (!user) return

  const portfolio = await getUserPortfolio(db, user.id)
  if (!portfolio) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  const markdownContent = exportPortfolioAsMarkdown(portfolio)
  const slug = normalizeMetadataKey(portfolio.user.name || portfolio.user.email) || `user-${portfolio.user.id}`
  const filename = `portfolio-${slug}.md`

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  return res.status(200).end(markdownContent)
}
