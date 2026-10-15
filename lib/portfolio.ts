import type { DatabaseClient } from './persistence/database'
import type { PostgresDb } from './persistence/postgresDb'
import { getQueryDatabase } from './persistence/kyselyDatabase'
import { listEvidences } from './evidenceRepository'

export type PortfolioItem = {
  id: number
  module_id: number
  module_title: string
  module_position: number
  roadmap_id: number
  roadmap_title: string
  evidence_type: 'github' | 'demo' | 'document' | 'note'
  url?: string | null
  note?: string | null
  review_status: 'pendiente' | 'aprobado' | 'requiere_cambios'
  admin_comment?: string | null
  reviewed_at?: string | null
  updated_at: string
}

export type UserPortfolio = {
  user: {
    id: number
    name?: string | null
    email: string
  }
  total_evidences: number
  approved_evidences: number
  roadmaps: Array<{
    id: number
    title: string
    items: PortfolioItem[]
  }>
}

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

export function exportPortfolioAsMarkdown(portfolio: UserPortfolio): string {
  const userName = portfolio.user.name || portfolio.user.email
  const lines: string[] = []

  lines.push(`# Portfolio de Evidencias - ${userName}`)
  lines.push('')
  lines.push(`- **Estudiante**: ${userName} (${portfolio.user.email})`)
  lines.push(`- **Total Entregables**: ${portfolio.total_evidences}`)
  lines.push(`- **Entregables Aprobados**: ${portfolio.approved_evidences}`)
  lines.push(`- **Fecha de Exportación**: ${new Date().toLocaleDateString('es-ES')}`)
  lines.push('')

  if (portfolio.roadmaps.length === 0) {
    lines.push('*(Aún no se han registrado entregables en el portfolio)*')
    lines.push('')
    return lines.join('\n')
  }

  for (const roadmap of portfolio.roadmaps) {
    lines.push(`## ${roadmap.title}`)
    lines.push('')

    for (const item of roadmap.items) {
      lines.push(`### Módulo ${item.module_position}: ${item.module_title}`)
      lines.push(`- **Tipo de evidencia**: ${item.evidence_type.toUpperCase()}`)
      if (item.url) {
        lines.push(`- **Enlace del proyecto**: [${item.url}](${item.url})`)
      }
      lines.push(`- **Estado de revisión**: ${item.review_status === 'aprobado' ? 'Aprobado ✓' : item.review_status === 'requiere_cambios' ? 'Requiere cambios ⚠️' : 'Pendiente de revisión ⏳'}`)
      if (item.note) {
        lines.push(`- **Descripción / Entregable**:`)
        lines.push(`  > ${item.note.replace(/\n/g, '\n  > ')}`)
      }
      if (item.admin_comment) {
        lines.push(`- **Retroalimentación del mentor**:`)
        lines.push(`  > ${item.admin_comment.replace(/\n/g, '\n  > ')}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}
