import React, { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Layout from '../components/Layout'
import { useAuth } from '../components/AuthProvider'
import { branding } from '../lib/branding'
import { UserPortfolio } from '../lib/portfolio'

const typeLabels: Record<string, string> = {
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

function reviewBadge(status: string) {
  if (status === 'aprobado') return { label: 'Aprobado ✓', class: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
  if (status === 'requiere_cambios') return { label: 'Requiere cambios ⚠️', class: 'bg-amber-100 text-amber-800 border-amber-200' }
  return { label: 'Pendiente de revisión ⏳', class: 'bg-sky-100 text-sky-800 border-sky-200' }
}

export default function PortfolioPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [portfolio, setPortfolio] = useState<UserPortfolio | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/portfolio')
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent(router.asPath)}`)
        return
      }
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'No se pudo cargar el portfolio.')
        return
      }
      setPortfolio(data)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (user) load()
  }, [user, load])

  if (authLoading || (loading && !portfolio && !error)) {
    return (
      <Layout>
        <main className="container py-8 text-sm text-slate-600">Cargando portfolio...</main>
      </Layout>
    )
  }

  return (
    <Layout>
      <Head>
        <title>{`Mi Portfolio | ${branding.productName}`}</title>
      </Head>

      <main>
        <section className="app-band">
          <div className="container flex flex-col gap-6 py-8 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Mi Progreso Profesional</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Portfolio de Evidencias</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Resumen de todos tus entregables prácticos, proyectos y validaciones de mentoría.
              </p>
            </div>

            {portfolio && portfolio.total_evidences > 0 && (
              <a
                href="/api/portfolio/export"
                download
                className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                <svg className="h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Exportar en Markdown (.md)
              </a>
            )}
          </div>
        </section>

        <section className="container py-8">
          {error && <p role="alert" className="mb-6 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          {portfolio && (
            <>
              <div className="mb-8 grid gap-4 sm:grid-cols-3">
                <div className="panel p-5">
                  <span className="block text-3xl font-bold text-sky-800">{portfolio.total_evidences}</span>
                  <span className="text-sm font-medium text-slate-600">Entregables registrados</span>
                </div>
                <div className="panel p-5">
                  <span className="block text-3xl font-bold text-emerald-700">{portfolio.approved_evidences}</span>
                  <span className="text-sm font-medium text-slate-600">Aprobados por mentores</span>
                </div>
                <div className="panel p-5">
                  <span className="block text-3xl font-bold text-slate-900">{portfolio.roadmaps.length}</span>
                  <span className="text-sm font-medium text-slate-600">Roadmaps con actividad</span>
                </div>
              </div>

              {portfolio.roadmaps.length === 0 ? (
                <div className="panel p-8 text-center">
                  <h2 className="text-lg font-semibold text-slate-950">Aún no has registrado evidencias</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    A medida que completes módulos en tus roadmaps y subas tus repositorios o notas de proyecto, aparecerán aquí.
                  </p>
                  <Link href="/roadmaps" className="primary-action mt-6 inline-flex">
                    Explorar Roadmaps
                  </Link>
                </div>
              ) : (
                <div className="space-y-8">
                  {portfolio.roadmaps.map(roadmap => (
                    <div key={roadmap.id} className="panel p-6">
                      <div className="border-b border-slate-100 pb-4">
                        <span className="text-xs font-semibold uppercase tracking-wider text-sky-700">Roadmap</span>
                        <h2 className="mt-1 text-2xl font-bold text-slate-950">{roadmap.title}</h2>
                      </div>

                      <div className="mt-6 grid gap-4 md:grid-cols-2">
                        {roadmap.items.map(item => {
                          const badge = reviewBadge(item.review_status)

                          return (
                            <div key={item.id} className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-5 transition hover:border-slate-300">
                              <div>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-sm border border-slate-200">
                                    {typeLabels[item.evidence_type] || item.evidence_type}
                                  </span>
                                  <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${badge.class}`}>
                                    {badge.label}
                                  </span>
                                </div>

                                <h3 className="mt-3 text-base font-semibold text-slate-950">
                                  Módulo {item.module_position}: {item.module_title}
                                </h3>

                                {item.url && (
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-2 block break-all text-sm font-semibold text-sky-700 hover:underline"
                                  >
                                    🔗 {item.url}
                                  </a>
                                )}

                                {item.note && (
                                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 bg-white p-3 rounded-md border border-slate-100">
                                    {item.note}
                                  </p>
                                )}

                                {item.admin_comment && (
                                  <div className="mt-3 rounded-md border border-sky-200 bg-sky-50/80 p-3 text-xs leading-5 text-sky-950">
                                    <span className="font-bold block uppercase tracking-wider text-sky-800">Feedback del mentor</span>
                                    <p className="mt-1 whitespace-pre-wrap">{item.admin_comment}</p>
                                  </div>
                                )}
                              </div>

                              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                                <span>Entregado el {formatDate(item.updated_at)}</span>
                                <Link href={`/modules/${item.module_id}`} className="font-semibold text-sky-700 hover:underline">
                                  Ir al módulo →
                                </Link>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </Layout>
  )
}
