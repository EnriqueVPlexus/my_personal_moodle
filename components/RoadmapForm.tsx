import React, { useState } from 'react'

type Props = {
  onCreate?: (data: any) => void
}

export default function RoadmapForm({ onCreate }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/roadmaps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description })
    })
    const data = await res.json()
    setTitle('')
    setDescription('')
    setLoading(false)
    if (onCreate) onCreate(data)
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <div>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Título del roadmap"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>
      <div>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Descripción (opcional)"
          className="min-h-24 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>
      <div>
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300" disabled={loading || !title}>
          {loading ? 'Guardando...' : 'Crear roadmap'}
        </button>
      </div>
    </form>
  )
}
