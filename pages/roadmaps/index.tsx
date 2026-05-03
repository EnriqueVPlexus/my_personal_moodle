import React, { useEffect, useState } from 'react'
import Layout from '../../components/Layout'
import RoadmapCard from '../../components/RoadmapCard'
import RoadmapForm from '../../components/RoadmapForm'
import Link from 'next/link'
import { useAuth } from '../../components/AuthProvider'

type Roadmap = {
  id: number
  title: string
  description?: string
  module_count?: number
}

export default function RoadmapsPage() {
  const { isAdmin } = useAuth()
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([])

  async function load() {
    const res = await fetch('/api/roadmaps')
    const data = await res.json()
    setRoadmaps(data)
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <Layout>
      <main className="container py-8">
        <div className="rounded-lg border border-blue-100 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Cantera técnica</p>
          <div className="mt-3 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-950">Roadmaps formativos</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                Rutas prácticas con módulos, recursos y evidencias para acompañar el aprendizaje técnico.
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <span className="block text-2xl font-bold text-gray-950">{roadmaps.length}</span>
              rutas disponibles
            </div>
          </div>
        </div>

        <section className="mt-6 grid gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {roadmaps.length > 0 ? (
              roadmaps.map(r => (
                <Link key={r.id} href={`/roadmaps/${r.id}`} className="block">
                  <RoadmapCard title={r.title} description={r.description} moduleCount={r.module_count} />
                </Link>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
                Todavía no hay roadmaps. Crea el primero con el formulario inferior.
              </div>
            )}
          </div>

          {isAdmin ? (
            <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-950">Crear nuevo roadmap</h2>
              <p className="mt-1 text-sm text-gray-600">Añade rutas internas rápidas para seguir ampliando la cantera.</p>
              <div className="mt-4">
                <RoadmapForm onCreate={() => load()} />
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-600 shadow-sm">
              Modo lectura: entra con una cuenta admin para crear nuevos roadmaps.
            </div>
          )}
        </section>
      </main>
    </Layout>
  )
}
