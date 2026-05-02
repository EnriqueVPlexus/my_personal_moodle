import React, { useEffect, useState } from 'react'
import Layout from '../../components/Layout'
import RoadmapCard from '../../components/RoadmapCard'
import RoadmapForm from '../../components/RoadmapForm'
import Link from 'next/link'

type Roadmap = {
  id: number
  title: string
  description?: string
}

export default function RoadmapsPage() {
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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Roadmaps</h1>
        </div>

        <section className="mt-6 grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roadmaps.map(r => (
              <Link key={r.id} href={`/roadmaps/${r.id}`}>
                <a>
                  <RoadmapCard title={r.title} description={r.description} />
                </a>
              </Link>
            ))}
          </div>

          <div className="mt-6">
            <h2 className="text-lg font-medium mb-2">Crear nuevo roadmap</h2>
            <RoadmapForm onCreate={() => load()} />
          </div>
        </section>
      </main>
    </Layout>
  )
}
