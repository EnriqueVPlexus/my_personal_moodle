import React, { useState } from 'react'

type Props = {
  roadmapId: number
  onCreate?: () => void
}

export default function ModuleForm({ roadmapId, onCreate }: Props) {
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, roadmap_id: roadmapId })
    })
    setTitle('')
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
      <div>
        <button className="primary-action px-3" disabled={!title || loading}>
          {loading ? 'Creando...' : 'Añadir módulo'}
        </button>
      </div>
    </form>
  )
}
