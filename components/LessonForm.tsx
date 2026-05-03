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
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
      />
      <div>
        <button className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300" disabled={!title || loading}>
          {loading ? 'Creando...' : 'Añadir lección'}
        </button>
      </div>
    </form>
  )
}
