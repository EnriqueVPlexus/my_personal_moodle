import React, { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { useAuth } from '../../components/AuthProvider'
import { branding } from '../../lib/branding'

type EvidenceRow = {
  id: number
  evidence_type: 'github' | 'demo' | 'document' | 'note'
  url?: string | null
  note?: string | null
  review_status?: 'pendiente' | 'aprobado' | 'requiere_cambios'
  admin_comment?: string | null
  reviewed_at?: string | null
  updated_at: string
  user_email: string
  user_name?: string | null
  module_id: number
  module_title: string
  roadmap_title: string
}

const typeLabels: Record<EvidenceRow['evidence_type'], string> = {
  github: 'GitHub',
  demo: 'Demo',
  document: 'Documento',
  note: 'Nota'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

function statusBadge(status?: EvidenceRow['review_status']) {
  if (status === 'aprobado') return { label: 'Aprobado', class: 'bg-emerald-100 text-emerald-800' }
  if (status === 'requiere_cambios') return { label: 'Requiere cambios', class: 'bg-amber-100 text-amber-800' }
  return { label: 'Pendiente de revisión', class: 'bg-sky-100 text-sky-800' }
}

export default function AdminEvidencesPage() {
  const { isAdmin, loading } = useAuth()
  const [evidences, setEvidences] = useState<EvidenceRow[]>([])
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>('all')
  const [loadingRows, setLoadingRows] = useState(true)
  const [error, setError] = useState('')

  // State for review inputs per evidence ID
  const [reviewComments, setReviewComments] = useState<Record<number, string>>({})
  const [reviewingId, setReviewingId] = useState<number | null>(null)

  const load = useCallback(async (statusFilter: string = activeStatusFilter) => {
    setLoadingRows(true)
    setError('')
    try {
      const query = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
      const res = await fetch(`/api/evidences${query}`)
      const data = await res.json().catch(() => [])
      if (!res.ok) {
        setError(data.error || 'No se pudieron cargar las evidencias.')
        return
      }
      setEvidences(data)
      const initialComments: Record<number, string> = {}
      data.forEach((row: EvidenceRow) => {
        initialComments[row.id] = row.admin_comment || ''
      })
      setReviewComments(initialComments)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setLoadingRows(false)
    }
  }, [activeStatusFilter])

  useEffect(() => {
    if (isAdmin) load(activeStatusFilter)
  }, [isAdmin, activeStatusFilter, load])

  async function handleReview(evidenceId: number, status: 'aprobado' | 'requiere_cambios' | 'pendiente') {
    setReviewingId(evidenceId)
    setError('')
    try {
      const res = await fetch(`/api/evidences/${evidenceId}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_status: status,
          admin_comment: reviewComments[evidenceId] || ''
        })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'No se pudo guardar la revisión.')
        return
      }
      await load(activeStatusFilter)
    } catch {
      setError('Error al comunicar con el servidor.')
    } finally {
      setReviewingId(null)
    }
  }

  if (loading) {
    return <Layout><main className="container py-8 text-sm text-slate-600">Comprobando permisos...</main></Layout>
  }

  if (!isAdmin) {
    return (
      <Layout>
        <main className="container py-8">
          <section className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
            <h1 className="text-xl font-bold">No autorizado</h1>
            <p className="mt-2 text-sm">Necesitas una cuenta admin para consultar evidencias.</p>
          </section>
        </main>
      </Layout>
    )
  }

  return (
    <Layout>
      <Head><title>{`Evidencias | ${branding.productName}`}</title></Head>
      <main>
        <section className="app-band">
          <div className="container py-8">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Admin</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Evidencias entregadas</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Consulta, evalúa y responde retroalimentación a las entregas de los alumnos.
            </p>
          </div>
        </section>
        <section className="container py-8">
          <div className="mb-6 flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'Todas' },
              { id: 'pendiente', label: 'Pendientes' },
              { id: 'aprobado', label: 'Aprobadas' },
              { id: 'requiere_cambios', label: 'Requiere cambios' }
            ].map(filter => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveStatusFilter(filter.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  activeStatusFilter === filter.id
                    ? 'bg-sky-700 text-white shadow-sm'
                    : 'bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {error && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {loadingRows ? (
            <p className="text-sm text-slate-600">Cargando evidencias...</p>
          ) : evidences.length === 0 ? (
            <div className="panel p-6 text-sm text-slate-600">No hay evidencias en este estado.</div>
          ) : (
            <div className="grid gap-4">
              {evidences.map(evidence => {
                const badge = statusBadge(evidence.review_status)
                const isSubmitting = reviewingId === evidence.id

                return (
                  <article key={evidence.id} className="panel p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                            {typeLabels[evidence.evidence_type]}
                          </span>
                          <span className={`rounded-md px-2 py-1 text-xs font-semibold ${badge.class}`}>
                            {badge.label}
                          </span>
                          <span className="text-xs text-slate-500">Entregado el {formatDate(evidence.updated_at)}</span>
                        </div>
                        <h2 className="mt-3 font-semibold text-slate-950">{evidence.module_title}</h2>
                        <p className="mt-1 text-sm text-slate-600">{evidence.roadmap_title}</p>
                        <p className="mt-2 text-sm font-medium text-slate-800">
                          {evidence.user_name || 'Sin nombre'} · {evidence.user_email}
                        </p>
                      </div>
                      <Link href={`/modules/${evidence.module_id}`} className="secondary-action">
                        Ver módulo
                      </Link>
                    </div>

                    {evidence.url && (
                      <a
                        href={evidence.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 block break-all text-sm font-semibold text-sky-800 underline"
                      >
                        Abrir evidencia
                      </a>
                    )}
                    {evidence.note && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">{evidence.note}</p>}

                    <div className="mt-5 border-t border-slate-200 pt-4">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Comentario de revisión (Mentoría)
                      </label>
                      <textarea
                        value={reviewComments[evidence.id] ?? ''}
                        onChange={e => setReviewComments({ ...reviewComments, [evidence.id]: e.target.value })}
                        placeholder="Escribe aquí las observaciones o correcciones para el alumno..."
                        rows={2}
                        className="form-field mt-2"
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleReview(evidence.id, 'aprobado')}
                          className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {isSubmitting ? 'Guardando...' : 'Aprobar'}
                        </button>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleReview(evidence.id, 'requiere_cambios')}
                          className="inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-50"
                        >
                          {isSubmitting ? 'Guardando...' : 'Solicitar cambios'}
                        </button>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleReview(evidence.id, 'pendiente')}
                          className="inline-flex items-center rounded-md bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-300 disabled:opacity-50"
                        >
                          Restablecer a Pendiente
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </Layout>
  )
}
