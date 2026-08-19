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

export async function getUserPortfolio(db: any, userId: number): Promise<UserPortfolio | null> {
  const userRow = await db.get(
    'SELECT id, name, email FROM users WHERE id = ? AND is_active = 1',
    [userId]
  )
  if (!userRow) return null

  const rows = await db.all(
    `SELECT e.id, e.module_id, e.evidence_type, e.url, e.note,
            COALESCE(e.review_status, 'pendiente') AS review_status,
            e.admin_comment, e.reviewed_at, e.updated_at,
            m.title AS module_title, m.position AS module_position,
            r.id AS roadmap_id, r.title AS roadmap_title
     FROM user_module_evidences e
     INNER JOIN modules m ON m.id = e.module_id
     INNER JOIN roadmaps r ON r.id = m.roadmap_id
     WHERE e.user_id = ?
     ORDER BY r.title, COALESCE(m.position, m.id), e.updated_at DESC`,
    [userId]
  )

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
      module_position: row.module_position,
      roadmap_id: row.roadmap_id,
      roadmap_title: row.roadmap_title,
      evidence_type: row.evidence_type,
      url: row.url,
      note: row.note,
      review_status: row.review_status,
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
