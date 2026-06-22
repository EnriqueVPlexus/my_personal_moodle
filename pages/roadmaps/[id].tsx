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

type RoadmapDetail = {
  id: number
  title: string
  description?: string
  objectives?: unknown
  methodology?: unknown
  evaluation_weights?: unknown
  modules?: LearningModule[]
}

function estimateDuration(modules: LearningModule[]) {
  let min = 0
  let max = 0

  modules.forEach(module => {
    const duration = module.duration || ''
    if (duration.includes('1 o 2')) {
      min += 1
      max += 2
    } else if (duration.includes('1')) {
      min += 1
      max += 1
    }
  })

  if (!min) return 'Por definir'
  return min === max ? `${min} semanas` : `${min}-${max} semanas`
}

export default function RoadmapDetailPage() {
  const router = useRouter()
  const { id } = router.query
  const { isAdmin } = useAuth()
  const [roadmap, setRoadmap] = useState<RoadmapDetail | null>(null)

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
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
                <span className="block text-2xl font-bold text-sky-800">{roadmap.modules?.length || 0}</span>
                <span className="text-sky-950">módulos</span>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                <span className="block text-2xl font-bold text-emerald-700">{estimateDuration(roadmap.modules || [])}</span>
                <span className="text-emerald-900">duración</span>
              </div>
            </div>
          </div>
        </section>

        <div className="container py-8">
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
              roadmap.modules.map((module, index) => (
                <details key={module.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" open={index === 0}>
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex gap-4">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-slate-950 text-sm font-bold text-white">
                          {module.position}
                        </span>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-950">{module.title}</h3>
                          {module.objective && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{module.objective}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        {module.duration && (
                          <span className="rounded-md bg-emerald-50 px-3 py-1 font-medium text-emerald-700">{module.duration}</span>
                        )}
                        <span className="font-medium text-sky-700">Ver detalle</span>
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
              ))
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
