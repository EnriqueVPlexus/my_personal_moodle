import type { DatabaseClient } from '../../../persistence/database'
import type { PostgresDb } from '../../../persistence/postgresDb'
import { getQueryDatabase } from '../../../persistence/kyselyDatabase'
import { listEvidences } from './evidenceRepository'
import type { PortfolioItem, UserPortfolio } from '../portfolio'
import type { PortfolioRepository } from '../ports'

type ActiveUserRow = { id: number; name: string | null; email: string }

async function findActiveUserForPortfolio(db: DatabaseClient, userId: number): Promise<ActiveUserRow | null> {
  if (db.backend !== 'postgres') {
    const row = await db.get<ActiveUserRow>(
      'SELECT id, name, email FROM users WHERE id = ? AND is_active = 1',
      [userId]
    )
    return row || null
  }

  const row = await getQueryDatabase((db as PostgresDb).getPool())
    .selectFrom('users')
    .select(['id', 'name', 'email'])
    .where('id', '=', userId)
    .where('is_active', '=', 1)
    .executeTakeFirst()

  return row ? { id: row.id, name: row.name, email: row.email } : null
}

export async function getUserPortfolio(db: DatabaseClient, userId: number): Promise<UserPortfolio | null> {
  const userRow = await findActiveUserForPortfolio(db, userId)
  if (!userRow) return null

  const rows = (await listEvidences(db, { userId })).slice().sort((a, b) => {
    if (a.roadmap_title !== b.roadmap_title) return a.roadmap_title < b.roadmap_title ? -1 : 1
    const aPosition = a.module_position ?? a.module_id
    const bPosition = b.module_position ?? b.module_id
    if (aPosition !== bPosition) return aPosition - bPosition
    return b.updated_at.localeCompare(a.updated_at)
  })

  const roadmapMap = new Map<number, { id: number; title: string; items: PortfolioItem[] }>()
  let approvedCount = 0

  for (const row of rows) {
    if (row.review_status === 'aprobado') approvedCount++
    if (!roadmapMap.has(row.roadmap_id)) {
      roadmapMap.set(row.roadmap_id, {
        id: row.roadmap_id,
        title: row.roadmap_title,
        items: []
      })
    }
    roadmapMap.get(row.roadmap_id)!.items.push({
      id: row.id,
      module_id: row.module_id,
      module_title: row.module_title,
      module_position: row.module_position ?? row.module_id,
      roadmap_id: row.roadmap_id,
      roadmap_title: row.roadmap_title,
      evidence_type: row.evidence_type as PortfolioItem['evidence_type'],
      url: row.url,
      note: row.note,
      review_status: row.review_status as PortfolioItem['review_status'],
      admin_comment: row.admin_comment,
      reviewed_at: row.reviewed_at,
      updated_at: row.updated_at
    })
  }

  return {
    user: {
      id: userRow.id,
      name: userRow.name || null,
      email: userRow.email
    },
    total_evidences: rows.length,
    approved_evidences: approvedCount,
    roadmaps: Array.from(roadmapMap.values())
  }
}

export function createPortfolioRepository(db: DatabaseClient): PortfolioRepository {
  return {
    getForUser: userId => getUserPortfolio(db, userId)
  }
}
