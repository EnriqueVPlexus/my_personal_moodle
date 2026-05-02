import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import ModuleCard from '../../components/ModuleCard'
import ModuleForm from '../../components/ModuleForm'
import ProgressBar from '../../components/ProgressBar'

type RoadmapDetail = {
  id: number
  title: string
  description?: string
  modules?: Array<{ id: number; title: string }>
}

export default function RoadmapDetailPage() {
  const router = useRouter()
  const { id } = router.query
  const [roadmap, setRoadmap] = useState<RoadmapDetail | null>(null)

  async function load() {
    if (!id) return
    const res = await fetch(`/api/roadmaps/${id}`)
    if (res.ok) {
      const data = await res.json()
      setRoadmap(data)
    }
  }

  useEffect(() => {
    load()
  }, [id])

  if (!roadmap) return (
    <Layout>
      <main className="container py-8">Cargando...</main>
    </Layout>
  )

  return (
    <Layout>
      <main className="container py-8">
        <h1 className="text-2xl font-semibold">{roadmap.title}</h1>
        {roadmap.description && <p className="text-sm text-gray-600">{roadmap.description}</p>}

        <div className="mt-6">
          <h2 className="font-medium">Módulos</h2>
          <div className="mt-3 space-y-2">
            {roadmap.modules && roadmap.modules.length > 0 ? (
              roadmap.modules.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between">
                  <ModuleCard title={m.title} />
                  <a className="text-sm text-blue-600" href={`/modules/${m.id}`}>Ver</a>
                </div>
              ))
            ) : (
              <p className="text-gray-500">No hay módulos todavía.</p>
            )}
          </div>

          <div className="mt-4">
            <h3 className="font-medium">Añadir módulo</h3>
            <div className="mt-2">
              <ModuleForm roadmapId={Number(id)} onCreate={() => load()} />
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="font-medium">Progreso</h3>
          <div className="mt-2 w-1/2"><ProgressBar value={0} /></div>
        </div>
      </main>
    </Layout>
  )
}
