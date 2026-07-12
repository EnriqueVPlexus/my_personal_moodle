import React, { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Layout from '../components/Layout'
import { branding } from '../lib/branding'

type UserRoadmapProgress = {
  roadmap_id: number
  title: string
  description?: string | null
  duration?: string | null
  last_activity_at: string
  completed_lessons_count: number
  total_lessons: number
  total_modules: number
  time_spent_seconds: number
  progress_percentage: number
  status: 'started' | 'in_progress' | 'paused' | 'completed'
  next_href: string
  next_step_label: string
  current_module_title?: string | null
  quiz_attempts_count: number
  average_quiz_percentage?: number | null
  best_quiz_percentage?: number | null
  last_quiz_percentage?: number | null
}

function formatStudyTime(totalSeconds: number) {
  if (!totalSeconds) return '0 min'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (!hours) return `${Math.max(1, minutes)} min`
  if (!minutes) return `${hours} h`
  return `${hours} h ${minutes} min`
}

function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function statusLabel(status: UserRoadmapProgress['status']) {
  if (status === 'completed') return 'Completado'
  if (status === 'paused') return 'Pausado'
  if (status === 'in_progress') return 'En curso'
  return 'Iniciado'
}

function formatQuizPercentage(value?: number | null) {
  return value === null || value === undefined ? 'Sin nota' : `${value}%`
}

export default function MyRoadmapsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [roadmaps, setRoadmaps] = useState<UserRoadmapProgress[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/progress/roadmaps')
    if (res.status === 401) {
      router.push(`/login?next=${encodeURIComponent(router.asPath)}`)
      return
    }

    if (res.ok) {
      setRoadmaps(await res.json())
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    load()
  }, [load])

  const startedCount = roadmaps.length
  const completedCount = roadmaps.filter(roadmap => roadmap.status === 'completed').length
  const pausedCount = roadmaps.filter(roadmap => roadmap.status === 'paused').length
  const totalStudySeconds = roadmaps.reduce((sum, roadmap) => sum + roadmap.time_spent_seconds, 0)
  const totalCompletedLessons = roadmaps.reduce((sum, roadmap) => sum + roadmap.completed_lessons_count, 0)
  const roadmapsWithQuiz = roadmaps.filter(roadmap => roadmap.average_quiz_percentage !== null && roadmap.average_quiz_percentage !== undefined)
  const averageQuizPercentage = roadmapsWithQuiz.length > 0
    ? Math.round(roadmapsWithQuiz.reduce((sum, roadmap) => sum + Number(roadmap.average_quiz_percentage || 0), 0) / roadmapsWithQuiz.length)
    : null

  return (
    <Layout>
      <Head>
        <title>{`Mi progreso | ${branding.productName}`}</title>
      </Head>

      <main>
        <section className="app-band">
          <div className="container grid gap-6 py-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Seguimiento personal</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Mis roadmaps</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                Un resumen de las rutas que ya has empezado, el punto exacto donde te quedaste
                y el siguiente paso recomendado para retomar ritmo sin perder tiempo.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <span className="block text-2xl font-bold text-slate-950">{startedCount}</span>
                <span className="text-slate-600">iniciados</span>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                <span className="block text-2xl font-bold text-emerald-700">{completedCount}</span>
                <span className="text-emerald-900">completados</span>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
                <span className="block text-2xl font-bold text-amber-700">{pausedCount}</span>
                <span className="text-amber-900">pausados</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <span className="block text-2xl font-bold text-slate-950">{totalCompletedLessons}</span>
                <span className="text-slate-600">lecciones</span>
              </div>
              <div className="rounded-lg border border-violet-100 bg-violet-50 p-4">
                <span className="block text-2xl font-bold text-violet-700">{formatQuizPercentage(averageQuizPercentage)}</span>
                <span className="text-violet-900">media quiz</span>
              </div>
              <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
                <span className="block text-2xl font-bold text-sky-800">{formatStudyTime(totalStudySeconds)}</span>
                <span className="text-sky-950">estudio</span>
              </div>
            </div>
          </div>
        </section>

        <section className="container py-8">
          {loading ? (
            <div className="panel p-5 text-sm text-slate-600">Cargando tu progreso...</div>
          ) : roadmaps.length > 0 ? (
            <div className="grid gap-4">
              {roadmaps.map(roadmap => (
                <article key={roadmap.roadmap_id} className="panel p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {statusLabel(roadmap.status)}
                        </span>
                        {roadmap.duration && (
                          <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            {roadmap.duration}
                          </span>
                        )}
                      </div>
                      <h2 className="mt-3 text-xl font-semibold text-slate-950">{roadmap.title}</h2>
                      {roadmap.description && (
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{roadmap.description}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm lg:w-[320px]">
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Progreso</span>
                        <span className="mt-1 block text-2xl font-bold text-slate-950">{roadmap.progress_percentage}%</span>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Lecciones</span>
                        <span className="mt-1 block text-2xl font-bold text-slate-950">
                          {roadmap.completed_lessons_count}/{roadmap.total_lessons}
                        </span>
                      </div>
                      <div className="rounded-md border border-violet-100 bg-violet-50 p-3">
                        <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-violet-700">Quiz</span>
                        <span className="mt-1 block text-2xl font-bold text-violet-800">
                          {formatQuizPercentage(roadmap.best_quiz_percentage)}
                        </span>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Intentos</span>
                        <span className="mt-1 block text-2xl font-bold text-slate-950">{roadmap.quiz_attempts_count || 0}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-sky-600 transition-all"
                        style={{ width: `${roadmap.progress_percentage}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-center">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Siguiente paso</span>
                      <span className="mt-1 block font-medium text-slate-950">{roadmap.next_step_label}</span>
                      {roadmap.current_module_title && (
                        <span className="mt-1 block text-slate-600">{roadmap.current_module_title}</span>
                      )}
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Actividad reciente</span>
                      <span className="mt-1 block font-medium text-slate-950">{formatActivityDate(roadmap.last_activity_at)}</span>
                      <span className="mt-1 block text-slate-600">{formatStudyTime(roadmap.time_spent_seconds)} acumulado</span>
                      <span className="mt-1 block text-slate-600">
                        Quiz medio: {formatQuizPercentage(roadmap.average_quiz_percentage)}
                      </span>
                    </div>
                    <div className="flex gap-3">
                      <Link
                        href={roadmap.next_href}
                        className="inline-flex items-center rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
                      >
                        Continuar
                      </Link>
                      <Link
                        href={`/roadmaps/${roadmap.roadmap_id}`}
                        className="inline-flex items-center rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Ver roadmap
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="panel p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Sin actividad todavía</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">Aún no has empezado ningún roadmap</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Cuando abras una ruta o entres en un módulo, empezaremos a guardar tu progreso
                aquí para que puedas retomarlo con contexto.
              </p>
              <div className="mt-5">
                <Link
                  href="/roadmaps"
                  className="inline-flex items-center rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Explorar roadmaps
                </Link>
              </div>
            </div>
          )}
        </section>
      </main>
    </Layout>
  )
}
