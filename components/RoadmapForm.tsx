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
          className="form-field"
        />
      </div>
      <div>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Descripción (opcional)"
          className="form-field min-h-24"
        />
      </div>
      <div>
        <button className="primary-action" disabled={loading || !title}>
          {loading ? 'Guardando...' : 'Crear roadmap'}
        </button>
      </div>
    </form>
  )
}
