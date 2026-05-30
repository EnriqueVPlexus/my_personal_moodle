import React, { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import RoadmapCard from '../../components/RoadmapCard'
import RoadmapForm from '../../components/RoadmapForm'
import Link from 'next/link'
import { useAuth } from '../../components/AuthProvider'
import { branding } from '../../lib/branding'

type Roadmap = {
  id: number
  title: string
  description?: string
  module_count?: number
}

export default function RoadmapsPage() {
  const router = useRouter()
  const { isAdmin } = useAuth()
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([])

  const load = useCallback(async () => {
    const res = await fetch('/api/roadmaps')
    if (res.status === 401) {
      router.push(`/login?next=${encodeURIComponent(router.asPath)}`)
      return
    }
    const data = await res.json()
    setRoadmaps(data)
  }, [router])

  useEffect(() => {
    load()
  }, [load])

  return (
    <Layout>
      <Head>
        <title>{`Roadmaps | ${branding.productName}`}</title>
      </Head>

      <main>
        <section className="app-band">
          <div className="container grid gap-5 py-8 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Cantera técnica</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Roadmaps formativos</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Rutas prácticas con módulos, recursos y evidencias para acompañar el aprendizaje técnico.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <span className="block text-2xl font-bold text-slate-950">{roadmaps.length}</span>
              rutas disponibles
            </div>
          </div>
        </section>

        <section className="container grid gap-4 py-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {roadmaps.length > 0 ? (
              roadmaps.map(r => (
                <Link key={r.id} href={`/roadmaps/${r.id}`} className="block">
                  <RoadmapCard title={r.title} description={r.description} moduleCount={r.module_count} />
                </Link>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                Todavía no hay roadmaps publicados.
              </div>
            )}
          </div>

          {isAdmin ? (
            <div className="panel mt-6 p-5">
              <h2 className="text-lg font-semibold text-slate-950">Crear nuevo roadmap</h2>
              <p className="mt-1 text-sm text-slate-600">Añade rutas internas rápidas para seguir ampliando la cantera.</p>
              <div className="mt-4">
                <RoadmapForm onCreate={() => load()} />
              </div>
            </div>
          ) : (
            <div className="panel mt-6 p-5 text-sm text-slate-600">
              Modo lectura: entra con una cuenta admin para crear nuevos roadmaps.
            </div>
          )}
        </section>
      </main>
    </Layout>
  )
}
