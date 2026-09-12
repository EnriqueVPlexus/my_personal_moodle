import React, { useState } from 'react'

type Props = {
  roadmapId: number
  onCreate?: () => void
}

export default function ModuleForm({ roadmapId, onCreate }: Props) {
  const [title, setTitle] = useState('')
  const [level, setLevel] = useState('')
  const [duration, setDuration] = useState('')
  const [durationMin, setDurationMin] = useState('')
  const [durationMax, setDurationMax] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        roadmap_id: roadmapId,
        level,
        duration,
        duration_weeks_min: durationMin,
        duration_weeks_max: durationMax
      })
    })
    setTitle('')
    setLevel('')
    setDuration('')
    setDurationMin('')
    setDurationMax('')
    setLoading(false)
    if (onCreate) onCreate()
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Título del módulo"
        className="form-field"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Nivel
          <select value={level} onChange={e => setLevel(e.target.value)} className="form-field">
            <option value="">Sin clasificar</option>
            <option value="beginner">Inicial</option>
            <option value="intermediate">Intermedio</option>
            <option value="advanced">Avanzado</option>
            <option value="capstone">Proyecto final</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Duración visible
          <input
            value={duration}
            onChange={e => setDuration(e.target.value)}
            placeholder="Ej. 2 semanas"
            className="form-field"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Mínimo (semanas)
          <input type="number" min="0" step="0.5" value={durationMin} onChange={e => setDurationMin(e.target.value)} className="form-field" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Máximo (semanas)
          <input type="number" min="0" step="0.5" value={durationMax} onChange={e => setDurationMax(e.target.value)} className="form-field" />
        </label>
      </div>
      <div>
        <button className="primary-action px-3" disabled={!title || loading}>
          {loading ? 'Creando...' : 'Añadir módulo'}
        </button>
      </div>
    </form>
  )
}
