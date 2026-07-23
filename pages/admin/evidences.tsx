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

export default function AdminEvidencesPage() {
  const { isAdmin, loading } = useAuth()
  const [evidences, setEvidences] = useState<EvidenceRow[]>([])
  const [loadingRows, setLoadingRows] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoadingRows(true)
    setError('')
    try {
      const res = await fetch('/api/evidences')
      const data = await res.json().catch(() => [])
      if (!res.ok) {
        setError(data.error || 'No se pudieron cargar las evidencias.')
        return
      }
      setEvidences(data)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setLoadingRows(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin, load])

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
              Consulta los entregables registrados por usuario y módulo.
            </p>
          </div>
        </section>
        <section className="container py-8">
          {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {loadingRows ? (
            <p className="text-sm text-slate-600">Cargando evidencias...</p>
          ) : evidences.length === 0 ? (
            <div className="panel p-6 text-sm text-slate-600">Todavía no hay evidencias entregadas.</div>
          ) : (
            <div className="grid gap-4">
              {evidences.map(evidence => (
                <article key={evidence.id} className="panel p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                          {typeLabels[evidence.evidence_type]}
                        </span>
                        <span className="text-xs text-slate-500">Actualizada el {formatDate(evidence.updated_at)}</span>
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
                      className="mt-4 block break-all text-sm font-semibold text-emerald-700 underline"
                    >
                      Abrir evidencia
                    </a>
                  )}
                  {evidence.note && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{evidence.note}</p>}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </Layout>
  )
}
