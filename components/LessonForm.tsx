import React, { useState } from 'react'

type Props = {
  moduleId: number
  onCreate?: () => void
}

export default function LessonForm({ moduleId, onCreate }: Props) {
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/lessons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, module_id: moduleId })
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
        placeholder="Título de la lección"
        className="form-field"
      />
      <div>
        <button className="primary-action px-3" disabled={!title || loading}>
          {loading ? 'Creando...' : 'Añadir lección'}
        </button>
      </div>
    </form>
  )
}
