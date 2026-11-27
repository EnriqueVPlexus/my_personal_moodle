import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { useAuth } from '../../components/AuthProvider'
import { branding } from '../../lib/branding'
import type { EvidenceListItem } from '../../lib/contracts'

type EvidenceRow = EvidenceListItem

type FilterOption = {
  key: string
  label: string
}

type SearchableFilterComboboxProps = {
  label: string
  placeholder: string
  allLabel: string
  options: FilterOption[]
  selectedKey: string
  onSelect: (key: string) => void
}

function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function SearchableFilterCombobox({
  label,
  placeholder,
  allLabel,
  options,
  selectedKey,
  onSelect
}: SearchableFilterComboboxProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  const selectedOption = useMemo(
    () => options.find(option => option.key === selectedKey) ?? null,
    [options, selectedKey]
  )

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query)
    if (!normalizedQuery) return options.slice(0, 15)
    return options
      .filter(option => normalizeSearchText(option.label).includes(normalizedQuery))
      .slice(0, 15)
  }, [options, query])

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  function chooseOption(key: string) {
    onSelect(key)
    setQuery('')
    setIsOpen(false)
  }

  const displayValue = isOpen ? query : (selectedOption?.label ?? '')

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <input
          type="text"
          role="combobox"
          aria-label={label}
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-autocomplete="list"
          value={displayValue}
          placeholder={selectedOption ? selectedOption.label : placeholder}
          onFocus={() => {
            setQuery('')
            setIsOpen(true)
          }}
          onChange={e => {
            setQuery(e.target.value)
            if (!isOpen) setIsOpen(true)
          }}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              setIsOpen(false)
              setQuery('')
            } else if (e.key === 'Enter' && isOpen && query.trim() && filteredOptions.length > 0) {
              e.preventDefault()
              chooseOption(filteredOptions[0].key)
            }
          }}
          className="form-field pr-8"
        />
        {selectedKey !== 'all' ? (
          <button
            type="button"
            aria-label={`Restablecer ${label.toLowerCase()}`}
            onClick={() => chooseOption('all')}
            className="absolute right-2 rounded px-1 text-xs font-bold text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        ) : (
          <span aria-hidden="true" className="pointer-events-none absolute right-2.5 text-xs text-slate-400">
            ▾
          </span>
        )}
      </div>

      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          <li>
            <button
              type="button"
              role="option"
              aria-selected={selectedKey === 'all'}
              onMouseDown={e => e.preventDefault()}
              onClick={() => chooseOption('all')}
              className={`flex w-full items-center justify-between px-3 py-2 text-left transition hover:bg-slate-50 ${
                selectedKey === 'all' ? 'bg-sky-50 font-semibold text-sky-800' : 'text-slate-700'
              }`}
            >
              <span>{allLabel}</span>
            </button>
          </li>
          {filteredOptions.length > 0 ? (
            filteredOptions.map(option => (
              <li key={option.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedKey === option.key}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => chooseOption(option.key)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left transition hover:bg-slate-50 ${
                    selectedKey === option.key ? 'bg-sky-50 font-semibold text-sky-800' : 'text-slate-700'
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-xs text-slate-500">Sin coincidencias</li>
          )}
        </ul>
      )}
    </div>
  )
}


const typeLabels: Record<EvidenceRow['evidence_type'], string> = {
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

function statusBadge(status?: EvidenceRow['review_status']) {
  if (status === 'aprobado') return { label: 'Aprobado', class: 'bg-emerald-100 text-emerald-800' }
  if (status === 'requiere_cambios') return { label: 'Requiere cambios', class: 'bg-amber-100 text-amber-800' }
  return { label: 'Pendiente de revisión', class: 'bg-sky-100 text-sky-800' }
}

export default function AdminEvidencesPage() {
  const { isAdmin, loading } = useAuth()
  const [evidences, setEvidences] = useState<EvidenceRow[]>([])
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>('all')
  const [userFilter, setUserFilter] = useState('all')
  const [roadmapFilter, setRoadmapFilter] = useState('all')
  const [loadingRows, setLoadingRows] = useState(true)
  const [error, setError] = useState('')

  // State for review inputs per evidence ID
  const [reviewComments, setReviewComments] = useState<Record<number, string>>({})
  const [reviewingAction, setReviewingAction] = useState<{
    id: number
    status: 'aprobado' | 'requiere_cambios' | 'pendiente'
  } | null>(null)

  const load = useCallback(async (statusFilter: string = activeStatusFilter) => {
    setLoadingRows(true)
    setError('')
    try {
      const query = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
      const res = await fetch(`/api/evidences${query}`)
      const data = await res.json().catch(() => [])
      if (!res.ok) {
        setError(data.error || 'No se pudieron cargar las evidencias.')
        return
      }
      setEvidences(data)
      const initialComments: Record<number, string> = {}
      data.forEach((row: EvidenceRow) => {
        initialComments[row.id] = row.admin_comment || ''
      })
      setReviewComments(initialComments)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setLoadingRows(false)
    }
  }, [activeStatusFilter])

  useEffect(() => {
    if (isAdmin) load(activeStatusFilter)
  }, [isAdmin, activeStatusFilter, load])

  const userOptions = useMemo(() => {
    const usersByEmail = new Map<string, string>()
    evidences.forEach(row => {
      if (!row.user_email) return
      const label = row.user_name ? `${row.user_name} (${row.user_email})` : row.user_email
      if (!usersByEmail.has(row.user_email)) {
        usersByEmail.set(row.user_email, label)
      }
    })
    return Array.from(usersByEmail.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))
  }, [evidences])

  const roadmapOptions = useMemo(() => {
    return Array.from(new Set(evidences.map(row => row.roadmap_title).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      .map(title => ({ key: title, label: title }))
  }, [evidences])

  const selectedUserOption = useMemo(
    () => userOptions.find(option => option.key === userFilter) ?? null,
    [userOptions, userFilter]
  )

  const hasClientFilters = Boolean(userFilter !== 'all' || roadmapFilter !== 'all')
  const hasAnyActiveFilter = Boolean(hasClientFilters || activeStatusFilter !== 'all')

  const filteredEvidences = useMemo(() => {
    return evidences.filter(row => {
      if (userFilter !== 'all' && row.user_email !== userFilter) return false
      if (roadmapFilter !== 'all' && row.roadmap_title !== roadmapFilter) return false
      return true
    })
  }, [evidences, userFilter, roadmapFilter])

  function clearFilters() {
    setUserFilter('all')
    setRoadmapFilter('all')
    setActiveStatusFilter('all')
  }

  async function handleReview(evidenceId: number, status: 'aprobado' | 'requiere_cambios' | 'pendiente') {
    setReviewingAction({ id: evidenceId, status })
    setError('')
    try {
      const res = await fetch(`/api/evidences/${evidenceId}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_status: status,
          admin_comment: reviewComments[evidenceId] || ''
        })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'No se pudo guardar la revisión.')
        return
      }
      await load(activeStatusFilter)
    } catch {
      setError('Error al comunicar con el servidor.')
    } finally {
      setReviewingAction(null)
    }
  }

  if (loading) {
    return <Layout><main className="container py-8 text-sm text-slate-600">Comprobando permisos...</main></Layout>
  }

  if (!isAdmin) {
    return (
      <Layout>
        <main className="container py-8">
          <section className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
            <h1 className="text-xl font-bold">No autorizado</h1>
            <p className="mt-2 text-sm">Necesitas una cuenta admin para consultar evidencias.</p>
          </section>
        </main>
      </Layout>
    )
  }

  return (
    <Layout>
      <Head><title>{`Evidencias | ${branding.productName}`}</title></Head>
      <main>
        <section className="app-band">
          <div className="container py-8">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Admin</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Evidencias entregadas</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Consulta, evalúa y responde retroalimentación a las entregas de los alumnos.
            </p>
          </div>
        </section>
        <section className="container py-8">
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'Todas' },
              { id: 'pendiente', label: 'Pendientes' },
              { id: 'aprobado', label: 'Aprobadas' },
              { id: 'requiere_cambios', label: 'Requiere cambios' }
            ].map(filter => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveStatusFilter(filter.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${activeStatusFilter === filter.id
                  ? 'bg-sky-700 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
                  }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="panel mb-6 grid gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-600">
                {hasClientFilters
                  ? `Mostrando ${filteredEvidences.length} de ${evidences.length} ${evidences.length === 1 ? 'evidencia' : 'evidencias'}`
                  : `${evidences.length} ${evidences.length === 1 ? 'evidencia' : 'evidencias'}`}
              </span>
              {hasAnyActiveFilter && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm font-semibold text-sky-700 hover:text-sky-900"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <SearchableFilterCombobox
                label="Filtrar por usuario"
                placeholder="Buscar y seleccionar usuario..."
                allLabel="Todos los usuarios"
                options={userOptions}
                selectedKey={userFilter}
                onSelect={setUserFilter}
              />
              <SearchableFilterCombobox
                label="Filtrar por roadmap"
                placeholder="Buscar y seleccionar roadmap..."
                allLabel="Todos los roadmaps"
                options={roadmapOptions}
                selectedKey={roadmapFilter}
                onSelect={setRoadmapFilter}
              />
            </div>

            {hasClientFilters && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {selectedUserOption && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                    <span>Usuario: {selectedUserOption.label}</span>
                    <button
                      type="button"
                      aria-label="Quitar filtro de usuario"
                      onClick={() => setUserFilter('all')}
                      className="text-sky-700 hover:text-sky-950"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {roadmapFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                    <span>Roadmap: {roadmapFilter}</span>
                    <button
                      type="button"
                      aria-label="Quitar filtro de roadmap"
                      onClick={() => setRoadmapFilter('all')}
                      className="text-sky-700 hover:text-sky-950"
                    >
                      ✕
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>

          {error && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {loadingRows ? (
            <p className="text-sm text-slate-600">Cargando evidencias...</p>
          ) : evidences.length === 0 ? (
            <div className="panel p-6 text-sm text-slate-600">No hay evidencias en este estado.</div>
          ) : filteredEvidences.length === 0 ? (
            <div className="panel p-6 text-sm text-slate-600">No hay evidencias que coincidan con los filtros seleccionados.</div>
          ) : (
            <div className="grid gap-4">
              {filteredEvidences.map(evidence => {
                const badge = statusBadge(evidence.review_status)
                const isSubmitting = reviewingAction?.id === evidence.id
                const savingStatus = isSubmitting ? reviewingAction.status : null

                return (
                  <article key={evidence.id} className="panel p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                            {typeLabels[evidence.evidence_type]}
                          </span>
                          <span className={`rounded-md px-2 py-1 text-xs font-semibold ${badge.class}`}>
                            {badge.label}
                          </span>
                          <span className="text-xs text-slate-500">Entregado el {formatDate(evidence.updated_at)}</span>
                        </div>
                        <h2 className="mt-3 font-semibold text-slate-950">{evidence.module_title}</h2>
                        <p className="mt-1 text-sm text-slate-600">{evidence.roadmap_title}</p>
                        <p className="mt-2 text-sm font-medium text-slate-800">
                          {evidence.user_name || 'Sin nombre'} · {evidence.user_email}
                        </p>
                      </div>
                      <Link href={`/modules/${evidence.module_id}`} className="secondary-action">
                        Ver módulo
                      </Link>
                    </div>

                    {evidence.url && (
                      <a
                        href={evidence.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 block break-all text-sm font-semibold text-sky-800 underline"
                      >
                        Abrir evidencia
                      </a>
                    )}
                    {evidence.note && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">{evidence.note}</p>}

                    <div className="mt-5 border-t border-slate-200 pt-4">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Comentario de revisión (Mentoría)
                      </label>
                      <textarea
                        value={reviewComments[evidence.id] ?? ''}
                        onChange={e => setReviewComments({ ...reviewComments, [evidence.id]: e.target.value })}
                        placeholder="Escribe aquí las observaciones o correcciones para el alumno..."
                        rows={2}
                        className="form-field mt-2"
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleReview(evidence.id, 'aprobado')}
                          className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {savingStatus === 'aprobado' ? 'Guardando...' : 'Aprobar'}
                        </button>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleReview(evidence.id, 'requiere_cambios')}
                          className="inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-50"
                        >
                          {savingStatus === 'requiere_cambios' ? 'Guardando...' : 'Solicitar cambios'}
                        </button>
                        {evidence.review_status && evidence.review_status !== 'pendiente' && (
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleReview(evidence.id, 'pendiente')}
                            className="inline-flex items-center rounded-md bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-300 disabled:opacity-50"
                          >
                            {savingStatus === 'pendiente' ? 'Guardando...' : 'Restablecer a Pendiente'}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main >
    </Layout >
  )
}
