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
    <form onSubmit={handleSubmit} className="space-y-2">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del módulo" className="w-full border rounded px-3 py-2" />
      <div>
        <button className="bg-green-600 text-white px-3 py-1 rounded" disabled={!title || loading}>
          {loading ? 'Creando...' : 'Añadir módulo'}
        </button>
      </div>
    </form>
  )
}
