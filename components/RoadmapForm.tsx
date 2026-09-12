import React, { useState } from 'react'

type Props = {
  onCreate?: (data: any) => void
}

export default function RoadmapForm({ onCreate }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [topics, setTopics] = useState('')
  const [duration, setDuration] = useState('')
  const [durationMin, setDurationMin] = useState('')
  const [durationMax, setDurationMax] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/roadmaps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        category,
        topics,
        duration,
        duration_weeks_min: durationMin,
        duration_weeks_max: durationMax
      })
    })
    const data = await res.json()
    setTitle('')
    setDescription('')
    setCategory('')
    setTopics('')
    setDuration('')
    setDurationMin('')
    setDurationMax('')
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
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Categoría principal
          <input
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="Ej. Cloud y DevOps"
            className="form-field"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Temas
          <input
            value={topics}
            onChange={e => setTopics(e.target.value)}
            placeholder="AWS, Terraform, CI/CD"
            className="form-field"
          />
          <span className="text-xs font-normal text-slate-500">Separados por comas.</span>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Duración visible
          <input
            value={duration}
            onChange={e => setDuration(e.target.value)}
            placeholder="Ej. 8-10 semanas"
            className="form-field"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Mínimo (semanas)
          <input
            type="number"
            min="0"
            step="0.5"
            value={durationMin}
            onChange={e => setDurationMin(e.target.value)}
            className="form-field"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Máximo (semanas)
          <input
            type="number"
            min="0"
            step="0.5"
            value={durationMax}
            onChange={e => setDurationMax(e.target.value)}
            className="form-field"
          />
        </label>
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
