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
