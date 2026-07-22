import React, { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '../../components/Layout'
import ModuleLearningContent from '../../components/ModuleLearningContent'
import ModuleForm from '../../components/ModuleForm'
import { useAuth } from '../../components/AuthProvider'
import { branding } from '../../lib/branding'
import {
  LearningModule,
  asEvaluationWeights,
  asTextList
} from '../../lib/roadmapPresentation'

type ModuleProgressStatus = 'not_started' | 'in_progress' | 'completed'

type ModuleProgress = {
  total_lessons: number
  completed_lessons_count: number
  progress_percentage: number
  status: ModuleProgressStatus
  next_lesson_title?: string | null
}

type RoadmapProgress = {
  completed_lessons_count: number
  total_lessons: number
  total_modules: number
  time_spent_seconds: number
  progress_percentage: number
  status: 'started' | 'in_progress' | 'paused' | 'completed'
  next_href: string
  next_step_label: string
}

type RoadmapModule = LearningModule & {
  progress?: ModuleProgress | null
}

type RoadmapDetail = {
  id: number
  title: string
  duration?: string
  description?: string
  objectives?: unknown
  methodology?: unknown
  evaluation_weights?: unknown
  modules?: RoadmapModule[]
  progress?: RoadmapProgress | null
  category?: { key: string; label: string } | null
  topics?: Array<{ key: string; label: string }>
}

function formatWeekCount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
}

function formatDuration(min: number, max: number) {
  if (min === max) return `${formatWeekCount(min)} ${min === 1 ? 'semana' : 'semanas'}`
  return `${formatWeekCount(min)}-${formatWeekCount(max)} semanas`
}

function parseWeekDuration(duration: string) {
  const normalized = duration.toLowerCase().replace(/,/g, '.')
  const range = normalized.match(/(\d+(?:\.\d+)?)\s*(?:-|–|a|o)\s*(\d+(?:\.\d+)?)\s*seman/)
  if (range) return [Number(range[1]), Number(range[2])]

  const single = normalized.match(/(\d+(?:\.\d+)?)\s*seman/)
  if (single) return [Number(single[1]), Number(single[1])]

  return null
}

function estimateDuration(modules: LearningModule[]) {
  let min = 0
  let max = 0

  modules.forEach(module => {
    const parsed = parseWeekDuration(module.duration || '')
    if (!parsed) return
    min += parsed[0]
    max += parsed[1]
  })

  if (!min) return 'Por definir'
  return formatDuration(min, max)
}

function moduleDisclosureKey(module: LearningModule, index: number) {
  return String(module.id ?? `${module.position ?? index}-${module.title}`)
}

function formatStudyTime(totalSeconds: number) {
  if (!totalSeconds) return '0 min'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (!hours) return `${Math.max(1, minutes)} min`
  if (!minutes) return `${hours} h`
  return `${hours} h ${minutes} min`
}

function roadmapStatusLabel(status: RoadmapProgress['status']) {
  if (status === 'completed') return 'Completado'
  if (status === 'paused') return 'Pausado'
  if (status === 'in_progress') return 'En curso'
  return 'Iniciado'
}

function moduleStatusLabel(status: ModuleProgressStatus) {
  if (status === 'completed') return 'Completado'
  if (status === 'in_progress') return 'En curso'
  return 'No iniciado'
}

function moduleStatusClass(status: ModuleProgressStatus) {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700'
  if (status === 'in_progress') return 'bg-sky-50 text-sky-700'
  return 'bg-slate-100 text-slate-600'
}

function moduleLevelLabel(level: LearningModule['level']) {
  if (level === 'beginner') return 'Inicial'
  if (level === 'intermediate') return 'Intermedio'
  if (level === 'advanced') return 'Avanzado'
  if (level === 'capstone') return 'Proyecto final'
  return 'Sin clasificar'
}

export default function RoadmapDetailPage() {
  const router = useRouter()
  const { id } = router.query
  const { isAdmin } = useAuth()
  const [roadmap, setRoadmap] = useState<RoadmapDetail | null>(null)
  const [openModuleKeys, setOpenModuleKeys] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (!id) return
    const res = await fetch(`/api/roadmaps/${id}`)
    if (res.status === 401) {
      router.push(`/login?next=${encodeURIComponent(router.asPath)}`)
      return
    }
    if (res.ok) {
      const data = await res.json()
      setRoadmap(data)
    }
  }, [id, router])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const firstModule = roadmap?.modules?.[0]
    setOpenModuleKeys(firstModule ? new Set([moduleDisclosureKey(firstModule, 0)]) : new Set())
  }, [roadmap?.id, roadmap?.modules])

  function handleModuleToggle(key: string) {
    setOpenModuleKeys(previous => {
      const next = new Set(previous)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  if (!roadmap) return (
    <Layout>
      <main className="container py-8 text-sm text-slate-600">Cargando...</main>
    </Layout>
  )

  return (
    <Layout>
      <Head>
        <title>{`${roadmap.title} | ${branding.productName}`}</title>
      </Head>

      <main>
        <section className="app-band">
          <div className="container grid gap-6 py-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Roadmap</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{roadmap.title}</h1>
              {roadmap.description && <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">{roadmap.description}</p>}
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-md bg-sky-100 px-2.5 py-1 font-semibold text-sky-800">
                  {roadmap.category?.label || 'Sin clasificar'}
                </span>
                {roadmap.topics?.map(topic => (
                  <span key={topic.key} className="rounded-md bg-white px-2.5 py-1 text-slate-600 shadow-sm">{topic.label}</span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
                <span className="block text-2xl font-bold text-sky-800">{roadmap.modules?.length || 0}</span>
                <span className="text-sky-950">módulos</span>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                <span className="block text-2xl font-bold text-emerald-700">{roadmap.duration || estimateDuration(roadmap.modules || [])}</span>
                <span className="text-emerald-900">duración</span>
              </div>
            </div>
          </div>
        </section>

        <div className="container py-8">
        {roadmap.progress && (
          <section className="panel mb-6 p-5">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {roadmapStatusLabel(roadmap.progress.status)}
                  </span>
                  <span className="rounded-md bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                    {roadmap.progress.progress_percentage}% completado
                  </span>
                </div>
                <h2 className="mt-3 text-lg font-semibold text-slate-950">Tu progreso en este roadmap</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {roadmap.progress.completed_lessons_count}/{roadmap.progress.total_lessons} lecciones completadas
                  · {formatStudyTime(roadmap.progress.time_spent_seconds)} acumulado.
                </p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-sky-600 transition-all"
                    style={{ width: `${roadmap.progress.progress_percentage}%` }}
                  />
                </div>
              </div>

              <div className="min-w-[220px] rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
                <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Siguiente paso</span>
                <span className="mt-1 block font-semibold text-slate-950">{roadmap.progress.next_step_label}</span>
                <Link
                  href={roadmap.progress.next_href}
                  className="mt-4 inline-flex rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Continuar
                </Link>
              </div>
            </div>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <div className="panel p-5">
            <h2 className="text-lg font-semibold text-slate-950">Objetivos generales</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {asTextList(roadmap.objectives).map(item => (
                <span key={item} className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="panel p-5">
            <h2 className="text-lg font-semibold text-slate-950">Metodología</h2>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              {asTextList(roadmap.methodology).map(item => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-semibold text-amber-950">Pesos de evaluación</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {asEvaluationWeights(roadmap.evaluation_weights).map(item => (
              <div key={item.label} className="rounded-md bg-white p-4 shadow-sm">
                <span className="block text-2xl font-bold text-amber-700">{item.value}</span>
                <span className="text-sm text-slate-700">{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Timeline</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">Módulos en orden</h2>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {roadmap.modules && roadmap.modules.length > 0 ? (
              roadmap.modules.map((module, index) => {
                const disclosureKey = moduleDisclosureKey(module, index)
                const isOpen = openModuleKeys.has(disclosureKey)

                return (
                <details
                  key={disclosureKey}
                  className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                  open={isOpen}
                >
                  <summary
                    className="cursor-pointer list-none"
                    onClick={event => {
                      event.preventDefault()
                      handleModuleToggle(disclosureKey)
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        handleModuleToggle(disclosureKey)
                      }
                    }}
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex gap-4">
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-sm font-bold ${
                          module.progress?.status === 'completed'
                            ? 'bg-emerald-600 text-white'
                            : module.progress?.status === 'in_progress'
                              ? 'bg-sky-600 text-white'
                              : 'bg-slate-950 text-white'
                        }`}>
                          {module.position}
                        </span>
                        <div className="min-w-0">
                          {module.progress && (
                            <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${moduleStatusClass(module.progress.status)}`}>
                              {moduleStatusLabel(module.progress.status)}
                            </span>
                          )}
                          <h3 className="text-lg font-semibold text-slate-950">{module.title}</h3>
                          {module.objective && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{module.objective}</p>}
                          {module.progress && (
                            <div className="mt-3 max-w-xl">
                              <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-600">
                                <span>{module.progress.completed_lessons_count}/{module.progress.total_lessons} lecciones</span>
                                <span>{module.progress.progress_percentage}%</span>
                              </div>
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className="h-full rounded-full bg-sky-600"
                                  style={{ width: `${module.progress.progress_percentage}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        {module.duration && (
                          <span className="rounded-md bg-emerald-50 px-3 py-1 font-medium text-emerald-700">{module.duration}</span>
                        )}
                        <span className="rounded-md bg-slate-100 px-3 py-1 font-medium text-slate-600">
                          {moduleLevelLabel(module.level)}
                        </span>
                        <span className="font-medium text-sky-700">{isOpen ? 'Ocultar detalle' : 'Ver detalle'}</span>
                      </div>
                    </div>
                  </summary>

                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <ModuleLearningContent module={module} />
                    {module.id && (
                      <Link href={`/modules/${module.id}`} className="mt-4 inline-flex rounded-md border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50">
                        Abrir página del módulo
                      </Link>
                    )}
                  </div>
                </details>
                )
              })
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                No hay módulos todavía.
              </p>
            )}
          </div>
        </section>

        {isAdmin ? (
          <section className="panel mt-8 p-5">
            <h3 className="text-lg font-semibold text-slate-950">Añadir módulo</h3>
            <p className="mt-1 text-sm text-slate-600">Puedes ampliar este roadmap con módulos internos propios.</p>
            <div className="mt-4">
              <ModuleForm roadmapId={Number(id)} onCreate={() => load()} />
            </div>
          </section>
        ) : (
          <section className="panel mt-8 p-5 text-sm text-slate-600">
            Modo lectura: puedes consultar módulos y abrir enlaces, pero solo admin puede añadir contenido.
          </section>
        )}
        </div>
      </main>
    </Layout>
  )
}
