import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { useAuth } from '../../components/AuthProvider'
import { AdminDashboardData } from '../../lib/adminDashboard'
import { branding } from '../../lib/branding'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

export default function AdminDashboardPage() {
  const { isAdmin, loading } = useAuth()
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoadingData(true)
    setError('')
    try {
      const res = await fetch('/api/admin/dashboard')
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'No se pudo cargar el dashboard.')
        return
      }
      setDashboard(data)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setLoadingData(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin, load])

  const maxRoadmapLearners = useMemo(() => (
    Math.max(1, ...(dashboard?.popular_roadmaps.map(row => row.learners_count) || []))
  ), [dashboard])

  if (loading) {
    return <Layout><main className="container py-8 text-sm text-slate-600">Comprobando permisos...</main></Layout>
  }

  if (!isAdmin) {
    return (
      <Layout>
        <main className="container py-8">
          <section className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
            <h1 className="text-xl font-bold">No autorizado</h1>
            <p className="mt-2 text-sm">Necesitas una cuenta admin para consultar el dashboard.</p>
            <Link href="/login" className="mt-4 inline-flex rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white">
              Entrar
            </Link>
          </section>
        </main>
      </Layout>
    )
  }

  return (
    <Layout>
      <Head><title>{`Dashboard admin | ${branding.productName}`}</title></Head>
      <main>
        <section className="app-band">
          <div className="container flex flex-col gap-4 py-8 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Admin</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Dashboard</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Actividad formativa, adopción de roadmaps, finalización de módulos y señales de abandono.
              </p>
            </div>
            {dashboard && (
              <p className="text-xs text-slate-500">
                Actualizado el {formatDate(dashboard.generated_at)}
              </p>
            )}
          </div>
        </section>

        <div className="container py-8">
          {error && (
            <div role="alert" className="mb-6 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              <button onClick={load} className="font-semibold underline">Reintentar</button>
            </div>
          )}

          {loadingData ? (
            <p className="text-sm text-slate-600">Calculando métricas...</p>
          ) : dashboard ? (
            <>
              <section aria-labelledby="overview-title">
                <h2 id="overview-title" className="text-xl font-semibold text-slate-950">Resumen</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {[
                    ['Usuarios', dashboard.overview.total_users, 'cuentas activas'],
                    ['Activos', dashboard.overview.active_users, `últimos ${dashboard.active_window_days} días`],
                    ['Roadmaps iniciados', dashboard.overview.started_roadmaps, 'participaciones'],
                    ['Roadmaps terminados', dashboard.overview.completed_roadmaps, 'participaciones'],
                    ['Evidencias', dashboard.overview.submitted_evidences, 'entregadas'],
                    ['Sin actividad', dashboard.overview.stalled_users, `más de ${dashboard.paused_after_days} días`]
                  ].map(([label, value, detail]) => (
                    <article key={String(label)} className="panel p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
                      <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
                      <p className="mt-1 text-xs text-slate-500">{detail}</p>
                    </article>
                  ))}
                </div>
              </section>

              <div className="mt-8 grid gap-6 xl:grid-cols-2">
                <section className="panel p-5" aria-labelledby="roadmaps-title">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-700">Adopción</p>
                    <h2 id="roadmaps-title" className="mt-1 text-xl font-semibold text-slate-950">Roadmaps más usados</h2>
                  </div>
                  <div className="mt-5 grid gap-4">
                    {dashboard.popular_roadmaps.length > 0 ? dashboard.popular_roadmaps.map(roadmap => (
                      <article key={roadmap.roadmap_id}>
                        <div className="flex items-start justify-between gap-3 text-sm">
                          <Link href={`/roadmaps/${roadmap.roadmap_id}`} className="font-semibold text-slate-900 hover:text-sky-700">
                            {roadmap.title}
                          </Link>
                          <span className="shrink-0 text-slate-600">{roadmap.learners_count} usuarios</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-sky-600"
                            style={{ width: `${Math.round(roadmap.learners_count * 100 / maxRoadmapLearners)}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-xs text-slate-500">
                          {roadmap.active_learners_count} activos · {roadmap.completed_learners_count} completados
                        </p>
                      </article>
                    )) : (
                      <p className="text-sm text-slate-500">Todavía no hay roadmaps iniciados.</p>
                    )}
                  </div>
                </section>

                <section className="panel p-5" aria-labelledby="modules-title">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-700">Finalización</p>
                    <h2 id="modules-title" className="mt-1 text-xl font-semibold text-slate-950">Módulos más completados</h2>
                  </div>
                  <div className="mt-5 grid gap-3">
                    {dashboard.completed_modules.length > 0 ? dashboard.completed_modules.map(module => (
                      <article key={module.module_id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Link href={`/modules/${module.module_id}`} className="font-semibold text-slate-900 hover:text-emerald-700">
                              {module.title}
                            </Link>
                            <p className="mt-1 text-xs text-slate-500">{module.roadmap_title} · {module.total_lessons} lecciones</p>
                          </div>
                          <span className="rounded-md bg-emerald-50 px-2 py-1 text-sm font-bold text-emerald-700">
                            {module.completed_learners_count}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          {module.completed_learners_count} de {module.learners_count} usuarios con actividad lo completaron.
                        </p>
                      </article>
                    )) : (
                      <p className="text-sm text-slate-500">Todavía no hay módulos completados.</p>
                    )}
                  </div>
                </section>
              </div>

              <section className="panel mt-6 p-5" aria-labelledby="stalled-title">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-700">Seguimiento</p>
                    <h2 id="stalled-title" className="mt-1 text-xl font-semibold text-slate-950">Usuarios sin actividad reciente</h2>
                  </div>
                  <p className="text-xs text-slate-500">Roadmaps incompletos sin actividad durante {dashboard.paused_after_days} días o más.</p>
                </div>
                <div className="mt-5 grid gap-3">
                  {dashboard.stalled_learners.length > 0 ? dashboard.stalled_learners.map(row => (
                    <article key={`${row.user_id}-${row.roadmap_id}`} className="grid gap-3 rounded-lg border border-amber-100 bg-amber-50 p-4 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
                      <div>
                        <p className="font-semibold text-slate-950">{row.name || row.email}</p>
                        <p className="mt-1 text-xs text-slate-600">{row.email}</p>
                      </div>
                      <div>
                        <Link href={`/roadmaps/${row.roadmap_id}`} className="text-sm font-semibold text-slate-900 hover:text-amber-700">
                          {row.roadmap_title}
                        </Link>
                        <p className="mt-1 text-xs text-slate-600">
                          {row.current_module_title || 'Sin módulo actual'} · {row.completed_lessons_count}/{row.total_lessons} lecciones
                        </p>
                      </div>
                      <div className="lg:text-right">
                        <p className="text-sm font-bold text-amber-800">{row.inactivity_days} días</p>
                        <p className="mt-1 text-xs text-slate-600">{row.progress_percentage}% completado</p>
                      </div>
                    </article>
                  )) : (
                    <p className="text-sm text-slate-500">No hay usuarios con roadmaps pausados.</p>
                  )}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>
    </Layout>
  )
}
