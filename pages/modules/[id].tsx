import React, { useCallback, useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import LessonForm from '../../components/LessonForm'
import ModuleLearningContent from '../../components/ModuleLearningContent'
import { useAuth } from '../../components/AuthProvider'
import { LearningModule } from '../../lib/roadmapPresentation'
import { branding } from '../../lib/branding'

type ModuleProgress = {
  total_lessons: number
  completed_lessons_count: number
  progress_percentage: number
  status: 'not_started' | 'in_progress' | 'completed'
  next_lesson_title?: string | null
  time_spent_seconds: number
}

type ModuleDetail = LearningModule & {
  progress?: ModuleProgress | null
}

type LessonWithProgress = {
  id: number
  title: string
  completed?: number | boolean
  progress_time_spent_seconds?: number
}

function formatStudyTime(totalSeconds: number) {
  if (!totalSeconds) return '0 min'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (!hours) return `${Math.max(1, minutes)} min`
  if (!minutes) return `${hours} h`
  return `${hours} h ${minutes} min`
}

function statusLabel(status: ModuleProgress['status']) {
  if (status === 'completed') return 'Completado'
  if (status === 'in_progress') return 'En curso'
  return 'No iniciado'
}

function fallbackProgress(lessons: LessonWithProgress[]): ModuleProgress {
  const completedLessonsCount = lessons.filter(lesson => Number(lesson.completed) === 1).length
  const totalLessons = lessons.length
  const progressPercentage = totalLessons > 0
    ? Math.min(100, Math.round((completedLessonsCount / totalLessons) * 100))
    : 0
  const nextLesson = lessons.find(lesson => Number(lesson.completed) !== 1)
  const status = totalLessons > 0 && completedLessonsCount >= totalLessons
    ? 'completed'
    : completedLessonsCount > 0
      ? 'in_progress'
      : 'not_started'

  return {
    total_lessons: totalLessons,
    completed_lessons_count: completedLessonsCount,
    progress_percentage: progressPercentage,
    status,
    next_lesson_title: nextLesson?.title ?? null,
    time_spent_seconds: lessons.reduce((sum, lesson) => (
      sum + Number(lesson.progress_time_spent_seconds || 0)
    ), 0)
  }
}

export default function ModulePage() {
  const router = useRouter()
  const { id } = router.query
  const { isAdmin, user } = useAuth()
  const [module, setModule] = useState<ModuleDetail | null>(null)
  const [lessons, setLessons] = useState<LessonWithProgress[]>([])
  const moduleOpenedAt = useRef(Date.now())

  const load = useCallback(async () => {
    if (!id) return
    const res = await fetch(`/api/modules/${id}`)
    if (res.status === 401) {
      router.push(`/login?next=${encodeURIComponent(router.asPath)}`)
      return
    }
    if (res.ok) {
      const data = await res.json()
      setModule(data)
      setLessons(data.lessons || [])
      moduleOpenedAt.current = Date.now()
    }
  }, [id, router])

  useEffect(() => { load() }, [load])

  async function toggleComplete(lesson: LessonWithProgress) {
    const elapsedSeconds = Math.max(30, Math.min(1800, Math.round((Date.now() - moduleOpenedAt.current) / 1000)))
    const res = await fetch(`/api/progress/lessons/${lesson.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        completed: !lesson.completed,
        time_spent_seconds: lesson.completed ? 0 : elapsedSeconds
      })
    })
    if (res.ok) load()
  }

  if (!module) return (
    <Layout>
      <main className="container py-8 text-sm text-slate-600">Cargando...</main>
    </Layout>
  )

  const progress = user ? module.progress || fallbackProgress(lessons) : null

  return (
    <Layout>
      <Head>
        <title>{`${module.title} | ${branding.productName}`}</title>
      </Head>

      <main>
        <section className="app-band">
          <div className="container grid gap-5 py-8 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Módulo {module.position ?? ''}</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{module.title}</h1>
              {module.objective && <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{module.objective}</p>}
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:w-[340px]">
              {module.duration && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                  <span className="block text-lg font-bold text-emerald-700">{module.duration}</span>
                  <span className="text-emerald-900">duración</span>
                </div>
              )}
              {progress && (
                <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
                  <span className="block text-lg font-bold text-sky-800">{progress.progress_percentage}%</span>
                  <span className="text-sky-950">progreso</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="container py-8">
          {progress && (
            <section className="panel mb-6 p-5">
              <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {statusLabel(progress.status)}
                    </span>
                    <span className="rounded-md bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                      {progress.completed_lessons_count}/{progress.total_lessons} lecciones
                    </span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-slate-950">Progreso del módulo</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {formatStudyTime(progress.time_spent_seconds)} acumulado en este módulo.
                  </p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-sky-600 transition-all"
                      style={{ width: `${progress.progress_percentage}%` }}
                    />
                  </div>
                </div>

                <div className="min-w-[220px] rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
                  <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Siguiente lección</span>
                  <span className="mt-1 block font-semibold text-slate-950">
                    {progress.next_lesson_title || 'Módulo completado'}
                  </span>
                </div>
              </div>
            </section>
          )}

          {module.objective && (
            <section>
              <ModuleLearningContent module={module} />
            </section>
          )}

        <section className="panel mt-6 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Lecciones</h2>
          <div className="mt-3 space-y-2">
            {lessons.length > 0 ? (
              lessons.map(l => (
                <div key={l.id} className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <span className={`mb-1 inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
                      l.completed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {l.completed ? 'Completada' : 'Pendiente'}
                    </span>
                    <div className={`text-sm ${l.completed ? 'line-through text-slate-500' : 'text-slate-800'}`}>{l.title}</div>
                  </div>
                  {user && (
                    <div className="space-x-2">
                      <button className="text-sm font-medium text-emerald-700" onClick={() => toggleComplete(l)}>
                        {l.completed ? 'Marcar como pendiente' : 'Marcar completada'}
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No hay lecciones todavía.</p>
            )}
          </div>

          {isAdmin ? (
            <div className="mt-4">
              <h3 className="font-semibold text-slate-950">Añadir lección</h3>
              <div className="mt-2">
                <LessonForm moduleId={Number(id)} onCreate={() => load()} />
              </div>
            </div>
          ) : user ? (
            <p className="mt-4 text-sm text-slate-500">Tu progreso se guarda por usuario cuando marques lecciones.</p>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Inicia sesión para guardar tu progreso en las lecciones.</p>
          )}
        </section>
        </div>
      </main>
    </Layout>
  )
}
