import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import RoadmapCard from '../../components/RoadmapCard'
import RoadmapForm from '../../components/RoadmapForm'
import Link from 'next/link'
import { useAuth } from '../../components/AuthProvider'
import { branding } from '../../lib/branding'
import {
  parseRoadmapCatalogFilters,
  ROADMAP_DURATION_FILTERS,
  RoadmapCatalogFilters
} from '../../lib/roadmapFilters'

type Roadmap = {
  id: number
  title: string
  description?: string
  module_count?: number
  category?: { key: string; label: string } | null
  topics?: Array<{ key: string; label: string }>
}

type FilterOption = { key: string; label?: string; roadmap_count: number }
type CatalogMetadata = {
  categories: FilterOption[]
  topics: FilterOption[]
  levels: FilterOption[]
  duration_ranges?: FilterOption[]
}

const SEARCH_DEBOUNCE_MS = 300

function queryValue(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value
  return String(firstValue ?? '').replace(/\s+/g, ' ').trim()
}

function levelLabel(key: string) {
  if (key === 'beginner') return 'Inicial'
  if (key === 'intermediate') return 'Intermedio'
  if (key === 'advanced') return 'Avanzado'
  if (key === 'capstone') return 'Proyecto final'
  return key
}

function canonicalCatalogQuery(search: string, filters: RoadmapCatalogFilters) {
  const query: Record<string, string | string[]> = {}
  if (search) query.q = search
  if (filters.categories.length) query.category = filters.categories
  if (filters.topics.length) query.topic = filters.topics
  if (filters.levels.length) query.level = filters.levels
  if (filters.durations.length) query.duration = filters.durations
  if (filters.sort !== 'relevance') query.sort = filters.sort
  return query
}

function managedCatalogQuery(query: Record<string, string | string[] | undefined>) {
  const managed: Record<string, string | string[]> = {}
  const search = queryValue(query.q)
  if (search) managed.q = search
  const managedKeys = ['category', 'topic', 'level', 'duration', 'sort']
  managedKeys.forEach(key => {
    const value = query[key]
    if (value !== undefined) managed[key] = value
  })
  return managed
}

export default function RoadmapsPage() {
  const router = useRouter()
  const { isAdmin } = useAuth()
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([])
  const initialQuery = queryValue(router.query.q as string | string[] | undefined)
  const [searchInput, setSearchInput] = useState(initialQuery)
  const [appliedQuery, setAppliedQuery] = useState(initialQuery)
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [metadata, setMetadata] = useState<CatalogMetadata | null>(null)
  const requestId = useRef(0)
  const categoryQuery = router.query.category
  const topicQuery = router.query.topic
  const levelQuery = router.query.level
  const durationQuery = router.query.duration
  const sortQuery = router.query.sort
  const filters = useMemo(() => parseRoadmapCatalogFilters({
    category: categoryQuery,
    topic: topicQuery,
    level: levelQuery,
    duration: durationQuery,
    sort: sortQuery
  }), [categoryQuery, topicQuery, levelQuery, durationQuery, sortQuery])
  const categoryKey = filters.categories.join(',')
  const topicKey = filters.topics.join(',')
  const levelKey = filters.levels.join(',')
  const durationKey = filters.durations.join(',')
  const sortKey = filters.sort

  const syncQueryToUrl = useCallback((query: string) => {
    const nextQuery = { ...router.query }
    if (query) nextQuery.q = query
    else delete nextQuery.q

    void router.replace(
      { pathname: router.pathname, query: nextQuery },
      undefined,
      { shallow: true }
    )
  }, [router])

  useEffect(() => {
    const urlQuery = queryValue(router.query.q as string | string[] | undefined)
    setSearchInput(current => current === urlQuery ? current : urlQuery)
    setAppliedQuery(current => current === urlQuery ? current : urlQuery)
  }, [router.query.q])

  useEffect(() => {
    const nextQuery = queryValue(searchInput)
    if (nextQuery === appliedQuery) return

    const timer = window.setTimeout(() => {
      setAppliedQuery(nextQuery)
      syncQueryToUrl(nextQuery)
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [appliedQuery, searchInput, syncQueryToUrl])

  useEffect(() => {
    const controller = new AbortController()
    async function loadMetadata() {
      try {
        const res = await fetch('/api/roadmaps/metadata', { signal: controller.signal })
        if (!res.ok) return
        const data = await res.json()
        if (Array.isArray(data?.categories) && Array.isArray(data?.topics) && Array.isArray(data?.levels)) {
          setMetadata(data)
        }
      } catch (metadataError) {
        if (!(metadataError instanceof DOMException && metadataError.name === 'AbortError')) {
          setMetadata(null)
        }
      }
    }
    void loadMetadata()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!metadata || !router.isReady) return
    const validCategories = new Set(metadata.categories.map(item => item.key))
    const validTopics = new Set(metadata.topics.map(item => item.key))
    const validLevels = new Set(metadata.levels.filter(item => item.roadmap_count > 0).map(item => item.key))
    const canonicalFilters = {
      ...filters,
      categories: filters.categories.filter(value => validCategories.has(value)),
      topics: filters.topics.filter(value => validTopics.has(value)),
      levels: filters.levels.filter(value => validLevels.has(value))
    }
    const current = JSON.stringify(managedCatalogQuery(router.query))
    const canonical = canonicalCatalogQuery(queryValue(router.query.q), canonicalFilters)
    if (current !== JSON.stringify(canonical)) {
      void router.replace({ pathname: router.pathname, query: canonical }, undefined, { shallow: true })
    }
  }, [metadata, router.isReady, filters, router])

  const load = useCallback(async (signal?: AbortSignal) => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (appliedQuery) params.set('q', appliedQuery)
      categoryKey.split(',').filter(Boolean).forEach(value => params.append('category', value))
      topicKey.split(',').filter(Boolean).forEach(value => params.append('topic', value))
      levelKey.split(',').filter(Boolean).forEach(value => params.append('level', value))
      durationKey.split(',').filter(Boolean).forEach(value => params.append('duration', value))
      if (sortKey !== 'relevance') params.set('sort', sortKey)
      const url = params.size > 0 ? `/api/roadmaps?${params.toString()}` : '/api/roadmaps'
      const res = await fetch(url, { signal })
      if (res.status === 401) {
        await router.push(`/login?next=${encodeURIComponent(router.asPath)}`)
        return
      }
      if (!res.ok) throw new Error('No se pudo cargar el catálogo')

      const data = await res.json()
      if (currentRequest === requestId.current) setRoadmaps(data)
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return
      if (currentRequest === requestId.current) {
        setRoadmaps([])
        setError('No hemos podido cargar los roadmaps. Inténtalo de nuevo.')
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
        setHasLoaded(true)
      }
    }
  }, [appliedQuery, categoryKey, topicKey, levelKey, durationKey, sortKey, router])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load, retryKey])

  const submittedSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextQuery = queryValue(searchInput)
    setSearchInput(nextQuery)
    setAppliedQuery(nextQuery)
    syncQueryToUrl(nextQuery)
  }

  const clearSearch = () => {
    setSearchInput('')
    setAppliedQuery('')
    syncQueryToUrl('')
  }

  const updateFilters = (nextFilters: RoadmapCatalogFilters) => {
    void router.replace(
      { pathname: router.pathname, query: canonicalCatalogQuery(appliedQuery, nextFilters) },
      undefined,
      { shallow: true }
    )
  }

  const toggleFilter = (
    family: 'categories' | 'topics' | 'levels' | 'durations',
    value: string
  ) => {
    const current = filters[family] as string[]
    const next = current.includes(value)
      ? current.filter(item => item !== value)
      : [...current, value]
    updateFilters({ ...filters, [family]: next } as RoadmapCatalogFilters)
  }

  const clearAll = () => {
    setSearchInput('')
    setAppliedQuery('')
    void router.replace({ pathname: router.pathname, query: {} }, undefined, { shallow: true })
  }

  const activeFilterCount = filters.categories.length + filters.topics.length +
    filters.levels.length + filters.durations.length

  const searchIsPending = queryValue(searchInput) !== appliedQuery
  const showResults = hasLoaded && !loading && !searchIsPending && !error
  const resultLabel = appliedQuery
    ? `${roadmaps.length} ${roadmaps.length === 1 ? 'resultado' : 'resultados'}`
    : `${roadmaps.length} ${roadmaps.length === 1 ? 'ruta disponible' : 'rutas disponibles'}`

  return (
    <Layout>
      <Head>
        <title>{`Roadmaps | ${branding.productName}`}</title>
      </Head>

      <main>
        <section className="app-band">
          <div className="container grid gap-5 py-8 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Cantera técnica</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Roadmaps formativos</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Rutas prácticas con módulos, recursos y evidencias para acompañar el aprendizaje técnico.
              </p>
            </div>
            <div
              aria-live="polite"
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
            >
              <span className="block text-2xl font-bold text-slate-950">{showResults ? roadmaps.length : '—'}</span>
              {showResults ? resultLabel.replace(/^\d+ /, '') : 'cargando catálogo'}
            </div>
          </div>
        </section>

        <section className="container grid gap-4 py-8">
          <form role="search" className="panel p-4" onSubmit={submittedSearch}>
            <label htmlFor="roadmap-search" className="block text-sm font-semibold text-slate-900">
              Buscar roadmaps
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="roadmap-search"
                type="search"
                value={searchInput}
                maxLength={100}
                autoComplete="off"
                placeholder="Título, tecnología, objetivo o contenido"
                onChange={event => setSearchInput(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
              <button
                type="submit"
                className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
              >
                Buscar
              </button>
              {searchInput || appliedQuery ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
                >
                  Limpiar búsqueda
                </button>
              ) : null}
            </div>
          </form>

          <section className="panel p-4" aria-labelledby="catalog-filters-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="catalog-filters-title" className="text-sm font-semibold text-slate-900">Filtrar y ordenar</h2>
                <p className="mt-1 text-xs text-slate-500">Puedes combinar familias; dentro de cada una se acepta cualquier opción marcada.</p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                Orden
                <select
                  value={filters.sort}
                  onChange={event => updateFilters({ ...filters, sort: event.target.value as RoadmapCatalogFilters['sort'] })}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="relevance">Relevancia</option>
                  <option value="title">Título</option>
                  <option value="duration">Duración</option>
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FilterGroup
                title="Categoría"
                options={metadata?.categories ?? []}
                selected={filters.categories}
                onToggle={value => toggleFilter('categories', value)}
              />
              <FilterGroup
                title="Temas"
                options={metadata?.topics ?? []}
                selected={filters.topics}
                onToggle={value => toggleFilter('topics', value)}
              />
              <FilterGroup
                title="Nivel"
                options={(metadata?.levels ?? []).filter(item => item.roadmap_count > 0).map(item => ({ ...item, label: levelLabel(item.key) }))}
                selected={filters.levels}
                onToggle={value => toggleFilter('levels', value)}
              />
              <FilterGroup
                title="Duración"
                options={metadata?.duration_ranges ?? ROADMAP_DURATION_FILTERS.map(item => ({ key: item.key, label: item.label, roadmap_count: 0 }))}
                selected={filters.durations}
                onToggle={value => toggleFilter('durations', value)}
                hideCounts={!metadata?.duration_ranges}
              />
            </div>

            {(activeFilterCount > 0 || appliedQuery || filters.sort !== 'relevance') && (
              <div aria-live="polite" className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                {filters.categories.map(value => <FilterChip key={`category-${value}`} label={metadata?.categories.find(item => item.key === value)?.label ?? value} onRemove={() => toggleFilter('categories', value)} />)}
                {filters.topics.map(value => <FilterChip key={`topic-${value}`} label={metadata?.topics.find(item => item.key === value)?.label ?? value} onRemove={() => toggleFilter('topics', value)} />)}
                {filters.levels.map(value => <FilterChip key={`level-${value}`} label={levelLabel(value)} onRemove={() => toggleFilter('levels', value)} />)}
                {filters.durations.map(value => <FilterChip key={`duration-${value}`} label={ROADMAP_DURATION_FILTERS.find(item => item.key === value)?.label ?? value} onRemove={() => toggleFilter('durations', value)} />)}
                <button type="button" onClick={clearAll} className="ml-auto rounded-sm text-sm font-semibold text-sky-700 hover:text-sky-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">
                  Limpiar todo
                </button>
              </div>
            )}
          </section>

          <div aria-live="polite" aria-atomic="true" className="min-h-6 text-sm text-slate-600">
            {loading || searchIsPending
              ? (hasLoaded ? 'Buscando roadmaps…' : 'Cargando catálogo…')
              : error
                ? error
                : resultLabel}
          </div>

          {error && !loading ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => setRetryKey(key => key + 1)}
                className="mt-3 rounded-md border border-red-300 bg-white px-3 py-2 font-semibold hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Reintentar
              </button>
            </div>
          ) : null}

          {showResults ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {roadmaps.length > 0 ? (
                roadmaps.map(r => (
                  <Link key={r.id} href={`/roadmaps/${r.id}`} className="block">
                    <RoadmapCard
                      title={r.title}
                      description={r.description}
                      moduleCount={r.module_count}
                      category={r.category?.label}
                      topics={r.topics?.map(topic => topic.label)}
                    />
                  </Link>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                  {appliedQuery
                    ? `No hay roadmaps que coincidan con “${appliedQuery}”. Prueba con otros términos.`
                    : 'Todavía no hay roadmaps publicados.'}
                </div>
              )}
            </div>
          ) : null}

          {isAdmin ? (
            <div className="panel mt-6 p-5">
              <h2 className="text-lg font-semibold text-slate-950">Crear nuevo roadmap</h2>
              <p className="mt-1 text-sm text-slate-600">Añade rutas internas rápidas para seguir ampliando la cantera.</p>
              <div className="mt-4">
                <RoadmapForm onCreate={() => setRetryKey(key => key + 1)} />
              </div>
            </div>
          ) : (
            <div className="panel mt-6 p-5 text-sm text-slate-600">
              Modo lectura: entra con una cuenta admin para crear nuevos roadmaps.
            </div>
          )}
        </section>
      </main>
    </Layout>
  )
}

function FilterGroup({
  title,
  options,
  selected,
  onToggle,
  hideCounts = false
}: {
  title: string
  options: FilterOption[]
  selected: string[]
  onToggle: (value: string) => void
  hideCounts?: boolean
}) {
  return (
    <fieldset>
      <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</legend>
      <div className="mt-2 grid max-h-48 gap-2 overflow-y-auto pr-1">
        {options.length ? options.map(option => (
          <label key={option.key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={selected.includes(option.key)}
              onChange={() => onToggle(option.key)}
              className="h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-500"
            />
            <span className="min-w-0 break-words">{option.label ?? option.key}</span>
            {!hideCounts && <span className="text-xs text-slate-400">({option.roadmap_count})</span>}
          </label>
        )) : <span className="text-sm text-slate-400">Sin opciones</span>}
      </div>
    </fieldset>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Quitar filtro ${label}`}
      className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
    >
      {label} <span aria-hidden="true">×</span>
    </button>
  )
}
