import React, { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import LessonForm from '../../components/LessonForm'
import ModuleLearningContent from '../../components/ModuleLearningContent'
import { useAuth } from '../../components/AuthProvider'
import { LearningModule } from '../../lib/roadmapPresentation'
import { branding } from '../../lib/branding'

export default function ModulePage() {
  const router = useRouter()
  const { id } = router.query
  const { isAdmin } = useAuth()
  const [module, setModule] = useState<LearningModule | null>(null)
  const [lessons, setLessons] = useState<any[]>([])

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
    }
  }, [id, router])

  useEffect(() => { load() }, [load])

  async function toggleComplete(lesson: any) {
    const res = await fetch(`/api/lessons/${lesson.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: lesson.title, completed: lesson.completed ? 0 : 1 })
    })
    if (res.ok) load()
  }

  if (!module) return (
    <Layout>
      <main className="container py-8 text-sm text-slate-600">Cargando...</main>
    </Layout>
  )

  return (
    <Layout>
      <Head>
        <title>{module.title} | {branding.productName}</title>
      </Head>

      <main>
        <section className="app-band">
          <div className="container flex flex-col gap-3 py-8 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Módulo {module.position ?? ''}</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{module.title}</h1>
              {module.objective && <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{module.objective}</p>}
            </div>
            {module.duration && (
              <span className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{module.duration}</span>
            )}
          </div>
        </section>

        <div className="container py-8">
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
                <div key={l.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div>
                    <div className={`text-sm ${l.completed ? 'line-through text-slate-500' : 'text-slate-800'}`}>{l.title}</div>
                  </div>
                  {isAdmin && (
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
          ) : (
            <p className="mt-4 text-sm text-slate-500">Modo lectura: solo admin puede añadir o marcar lecciones.</p>
          )}
        </section>
        </div>
      </main>
    </Layout>
  )
}
