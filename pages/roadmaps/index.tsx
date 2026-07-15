import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import RoadmapCard from '../../components/RoadmapCard'
import RoadmapForm from '../../components/RoadmapForm'
import Link from 'next/link'
import { useAuth } from '../../components/AuthProvider'
import { branding } from '../../lib/branding'

type Roadmap = {
  id: number
  title: string
  description?: string
  module_count?: number
}

const SEARCH_DEBOUNCE_MS = 300

function queryValue(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value
  return String(firstValue ?? '').replace(/\s+/g, ' ').trim()
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
  const requestId = useRef(0)

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

  const load = useCallback(async (signal?: AbortSignal) => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (appliedQuery) params.set('q', appliedQuery)
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
  }, [appliedQuery, router])

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
                    <RoadmapCard title={r.title} description={r.description} moduleCount={r.module_count} />
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
