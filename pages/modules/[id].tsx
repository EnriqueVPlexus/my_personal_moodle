import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import LessonForm from '../../components/LessonForm'

export default function ModulePage() {
  const router = useRouter()
  const { id } = router.query
  const [module, setModule] = useState<any | null>(null)
  const [lessons, setLessons] = useState<any[]>([])

  async function load() {
    if (!id) return
    const res = await fetch(`/api/modules/${id}`)
    if (res.ok) {
      const data = await res.json()
      setModule(data)
      setLessons(data.lessons || [])
    }
  }

  useEffect(() => { load() }, [id])

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
      <main className="container py-8">Cargando...</main>
    </Layout>
  )

  return (
    <Layout>
      <main className="container py-8">
        <h1 className="text-2xl font-semibold">{module.title}</h1>
        <p className="text-sm text-gray-600">Módulo: {module.title}</p>

        <div className="mt-6">
          <h2 className="font-medium">Lecciones</h2>
          <div className="mt-3 space-y-2">
            {lessons.length > 0 ? (
              lessons.map(l => (
                <div key={l.id} className="flex items-center justify-between border p-2 rounded">
                  <div>
                    <div className={`text-sm ${l.completed ? 'line-through text-gray-500' : ''}`}>{l.title}</div>
                  </div>
                  <div className="space-x-2">
                    <button className="text-sm text-green-600" onClick={() => toggleComplete(l)}>
                      {l.completed ? 'Marcar como pendiente' : 'Marcar completada'}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500">No hay lecciones todavía.</p>
            )}
          </div>

          <div className="mt-4">
            <h3 className="font-medium">Añadir lección</h3>
            <div className="mt-2">
              <LessonForm moduleId={Number(id)} onCreate={() => load()} />
            </div>
          </div>
        </div>
      </main>
    </Layout>
  )
}
