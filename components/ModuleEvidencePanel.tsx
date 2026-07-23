import React, { useEffect, useState } from 'react'

export type ModuleEvidence = {
  id: number
  evidence_type: 'github' | 'demo' | 'document' | 'note'
  url?: string | null
  note?: string | null
  created_at: string
  updated_at: string
}

type Props = {
  moduleId: number
  evidence: ModuleEvidence | null
  onChange: (evidence: ModuleEvidence | null) => void
}

const typeLabels: Record<ModuleEvidence['evidence_type'], string> = {
  github: 'GitHub',
  demo: 'Demo',
  document: 'Documento',
  note: 'Nota'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

export default function ModuleEvidencePanel({ moduleId, evidence, onChange }: Props) {
  const [evidenceType, setEvidenceType] = useState<ModuleEvidence['evidence_type']>('github')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(!evidence)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setEvidenceType(evidence?.evidence_type || 'github')
    setUrl(evidence?.url || '')
    setNote(evidence?.note || '')
    setEditing(!evidence)
  }, [evidence])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/evidences/modules/${moduleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evidence_type: evidenceType,
          url,
          note
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No se pudo guardar la evidencia.')
        return
      }
      onChange(data.evidence)
      setEditing(false)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!window.confirm('¿Eliminar esta evidencia?')) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/evidences/modules/${moduleId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'No se pudo eliminar la evidencia.')
        return
      }
      onChange(null)
      setEditing(true)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel mt-6 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-950">Evidencia y portfolio</h2>
            <span className={`rounded-md px-2 py-1 text-xs font-semibold ${
              evidence ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {evidence ? 'Con evidencia' : 'Solo lectura'}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Registra un entregable que demuestre la aplicación práctica de este módulo.
          </p>
        </div>
        {evidence && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="secondary-action">
            Editar evidencia
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {evidence && !editing ? (
        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-emerald-800">
              {typeLabels[evidence.evidence_type]}
            </span>
            <span className="text-xs text-emerald-800">Actualizada el {formatDate(evidence.updated_at)}</span>
          </div>
          {evidence.url && (
            <a
              href={evidence.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block break-all text-sm font-semibold text-emerald-800 underline"
            >
              Abrir evidencia
            </a>
          )}
          {evidence.note && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-emerald-950">{evidence.note}</p>}
          <button
            type="button"
            onClick={remove}
            disabled={saving}
            className="mt-4 text-sm font-semibold text-red-700 disabled:text-slate-400"
          >
            {saving ? 'Eliminando...' : 'Eliminar evidencia'}
          </button>
        </div>
      ) : (
        <form onSubmit={save} className="mt-4 grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            Tipo de evidencia
            <select
              value={evidenceType}
              onChange={event => setEvidenceType(event.target.value as ModuleEvidence['evidence_type'])}
              className="form-field"
            >
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            Enlace
            <input
              type="url"
              value={url}
              onChange={event => setUrl(event.target.value)}
              placeholder="https://github.com/usuario/proyecto"
              maxLength={2048}
              className="form-field"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            Nota
            <textarea
              value={note}
              onChange={event => setNote(event.target.value)}
              placeholder="Describe brevemente qué has entregado y qué demuestra."
              maxLength={4000}
              rows={4}
              className="form-field"
            />
          </label>
          <p className="text-xs text-slate-500">Añade al menos un enlace o una nota.</p>
          <div className="flex flex-wrap gap-2">
            <button disabled={saving || (!url.trim() && !note.trim())} className="primary-action">
              {saving ? 'Guardando...' : evidence ? 'Guardar cambios' : 'Registrar evidencia'}
            </button>
            {evidence && (
              <button type="button" onClick={() => setEditing(false)} className="secondary-action">
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  )
}
