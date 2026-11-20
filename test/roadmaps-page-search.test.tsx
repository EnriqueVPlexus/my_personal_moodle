import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const nextRouterMock = (globalThis as any).__NEXT_ROUTER_MOCK__ as {
  asPath: string
  pathname: string
  isReady: boolean
  push: ReturnType<typeof vi.fn>
  replace: ReturnType<typeof vi.fn>
  query: Record<string, unknown>
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body)
  } as any
}

async function renderCatalog(options: {
  query?: string
  routeQuery?: Record<string, string | string[]>
  isAdmin?: boolean
  user?: { id: number; email: string; role: 'admin' | 'user' } | null
  authLoading?: boolean
} = {}) {
  nextRouterMock.pathname = '/roadmaps'
  nextRouterMock.asPath = options.query ? `/roadmaps?q=${encodeURIComponent(options.query)}` : '/roadmaps'
  nextRouterMock.query = options.routeQuery ?? (options.query ? { q: options.query } : {})
  nextRouterMock.replace.mockResolvedValue(true)
  nextRouterMock.push.mockResolvedValue(true)

  const mockedUser = options.user !== undefined
    ? options.user
    : (options.isAdmin ? { id: 1, email: 'admin@plexus.es', role: 'admin' as const } : null)

  vi.doMock('../components/AuthProvider', () => ({
    useAuth: () => ({
      isAdmin: Boolean(options.isAdmin),
      user: mockedUser,
      loading: Boolean(options.authLoading)
    })
  }))

  const RoadmapsPage = (await import('../pages/roadmaps/index')).default
  return { RoadmapsPage, ...render(<RoadmapsPage />) }
}

describe('roadmap catalog search experience', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('restores q from the URL and distinguishes a search without matches', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse([]))

    await renderCatalog({ query: 'observabilidad' })

    expect(screen.getByRole('searchbox', { name: 'Buscar roadmaps' })).toHaveValue('observabilidad')
    expect(await screen.findByText(/No hay roadmaps que coincidan con “observabilidad”/)).toBeInTheDocument()
    expect(screen.getByText('0 resultados')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/roadmaps?q=observabilidad',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('debounces input, updates the URL and clears the active search', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async url => {
      if (String(url).includes('?q=AWS')) {
        return jsonResponse([{ id: 2, title: 'AWS práctico', module_count: 4 }])
      }
      return jsonResponse([{ id: 1, title: 'Catálogo completo', module_count: 8 }])
    })

    await renderCatalog()
    expect(await screen.findByText('Catálogo completo')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar roadmaps' }), {
      target: { value: '  AWS  ' }
    })
    expect(screen.getByText('Buscando roadmaps…')).toBeInTheDocument()
    expect(screen.getByText('Catálogo completo')).toBeInTheDocument()
    expect(screen.getByText('Catálogo completo').closest('[aria-busy="true"]')).toBeInTheDocument()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/roadmaps?q=AWS',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    ))
    expect(await screen.findByText('AWS práctico')).toBeInTheDocument()
    expect(nextRouterMock.replace).toHaveBeenCalledWith(
      { pathname: '/roadmaps', query: { q: 'AWS' } },
      undefined,
      { shallow: true, scroll: false }
    )

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
    expect(await screen.findByText('Catálogo completo')).toBeInTheDocument()
    expect(nextRouterMock.replace).toHaveBeenLastCalledWith(
      { pathname: '/roadmaps', query: {} },
      undefined,
      { shallow: true, scroll: false }
    )
  })

  it('aborts an obsolete request so a newer result wins', async () => {
    let awsSignal: AbortSignal | undefined
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).includes('?q=AWS')) {
        awsSignal = init?.signal as AbortSignal
        return new Promise(() => { })
      }
      if (String(url).includes('?q=IA')) {
        return jsonResponse([{ id: 3, title: 'IA para DevOps', module_count: 5 }])
      }
      return jsonResponse([{ id: 1, title: 'Inicial', module_count: 1 }])
    })

    await renderCatalog()
    expect(await screen.findByText('Inicial')).toBeInTheDocument()

    const searchbox = screen.getByRole('searchbox', { name: 'Buscar roadmaps' })
    fireEvent.change(searchbox, { target: { value: 'AWS' } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/roadmaps?q=AWS',
      expect.anything()
    ))

    fireEvent.change(searchbox, { target: { value: 'IA' } })
    expect(await screen.findByText('IA para DevOps')).toBeInTheDocument()
    expect(awsSignal?.aborted).toBe(true)
    expect(screen.queryByText('Inicial')).not.toBeInTheDocument()
  })

  it('restores searches after navigation and offers retry without hiding the admin form', async () => {
    const catalogResponses = [
      jsonResponse([{ id: 1, title: 'Todos', module_count: 1 }]),
      jsonResponse([{ id: 2, title: 'AWS desde URL', module_count: 2 }])
    ]
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async url => (
      String(url).startsWith('/api/roadmaps/metadata')
        ? jsonResponse({ categories: [], topics: [], levels: [] })
        : catalogResponses.shift() ?? jsonResponse([])
    ))

    const { RoadmapsPage, rerender } = await renderCatalog({ isAdmin: true })
    expect(await screen.findByText('Todos')).toBeInTheDocument()
    expect(screen.getByText('Crear nuevo roadmap')).toBeInTheDocument()

    nextRouterMock.query = { q: 'AWS' }
    nextRouterMock.asPath = '/roadmaps?q=AWS'
    rerender(<RoadmapsPage />)

    expect(await screen.findByText('AWS desde URL')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar roadmaps' })).toHaveValue('AWS')

    let failNextCatalogFetch = true
    fetchMock.mockImplementation(async url => {
      if (String(url).startsWith('/api/roadmaps/metadata')) {
        return jsonResponse({ categories: [], topics: [], levels: [] })
      }
      if (failNextCatalogFetch) {
        failNextCatalogFetch = false
        throw new TypeError('network error')
      }
      return jsonResponse([{ id: 3, title: 'Recuperado', module_count: 3 }])
    })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar roadmaps' }), {
      target: { value: 'fallo' }
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('No hemos podido cargar los roadmaps')
    expect(screen.getByText('Crear nuevo roadmap')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Recuperado')).toBeInTheDocument()
  })

  it('shows a distinct empty-catalog message', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse([]))

    await renderCatalog()

    expect(await screen.findByText('Todavía no hay roadmaps publicados.')).toBeInTheDocument()
    expect(screen.queryByText(/No hay roadmaps que coincidan/)).not.toBeInTheDocument()
  })

  it('restores combinable filters from the URL and removes one chip without clearing the rest', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async url => {
      if (String(url).startsWith('/api/roadmaps/metadata')) {
        return jsonResponse({
          categories: [{ key: 'cloud-y-devops', label: 'Cloud y DevOps', roadmap_count: 1 }],
          topics: [{ key: 'aws', label: 'AWS', roadmap_count: 1 }],
          levels: [{ key: 'beginner', roadmap_count: 1 }]
        })
      }
      return jsonResponse([{ id: 1, title: 'AWS práctico', module_count: 4 }])
    })

    await renderCatalog({
      routeQuery: { q: 'cloud', category: 'cloud-y-devops', topic: 'aws', sort: 'title' }
    })

    expect(await screen.findByText('AWS práctico')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Cloud y DevOps/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /AWS/ })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Orden' })).toHaveValue('title')

    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro Cloud y DevOps' }))
    expect(nextRouterMock.replace).toHaveBeenLastCalledWith(
      { pathname: '/roadmaps', query: { q: 'cloud', topic: ['aws'], sort: 'title' } },
      undefined,
      { shallow: true, scroll: false }
    )

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar todo' }))
    expect(nextRouterMock.replace).toHaveBeenLastCalledWith(
      { pathname: '/roadmaps', query: {} },
      undefined,
      { shallow: true, scroll: false }
    )
  })

  it('canonicalizes invalid filter URLs and keeps long dynamic options accessible', async () => {
    const longTopic = 'Observabilidad distribuida para plataformas empresariales con nombres extensos'
    vi.spyOn(global, 'fetch').mockImplementation(async url => {
      if (String(url).startsWith('/api/roadmaps/metadata')) {
        return jsonResponse({
          categories: [{ key: 'cloud-y-devops', label: 'Cloud y DevOps', roadmap_count: 1 }],
          topics: [{ key: 'observabilidad', label: longTopic, roadmap_count: 1 }],
          levels: [{ key: 'beginner', roadmap_count: 1 }],
          duration_ranges: [{ key: '5-to-12', label: '5-12 semanas', roadmap_count: 1 }]
        })
      }
      return jsonResponse([{ id: 1, title: 'Plataforma', module_count: 8 }])
    })

    await renderCatalog({
      routeQuery: {
        category: 'cloud-y-devops',
        topic: 'desconocido',
        level: 'expert',
        duration: 'forever',
        sort: 'random'
      }
    })

    expect(await screen.findByRole('checkbox', { name: new RegExp(longTopic) })).toBeInTheDocument()
    await waitFor(() => expect(nextRouterMock.replace).toHaveBeenCalledWith(
      { pathname: '/roadmaps', query: { category: ['cloud-y-devops'] } },
      undefined,
      { shallow: true, scroll: false }
    ))
  })

  it('hides the progress status filter and strips progress_status from URL for unauthenticated visitors', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async url => {
      if (String(url).startsWith('/api/roadmaps/metadata')) {
        return jsonResponse({
          categories: [{ key: 'cloud-y-devops', label: 'Cloud y DevOps', roadmap_count: 3 }],
          topics: [],
          levels: [{ key: 'beginner', roadmap_count: 3 }],
          progress_statuses: [
            { key: 'not_started', label: 'Sin empezar', roadmap_count: 3 },
            { key: 'in_progress', label: 'En curso', roadmap_count: 0 },
            { key: 'completed', label: 'Completados', roadmap_count: 0 }
          ]
        })
      }
      return jsonResponse([{ id: 1, title: 'AWS práctico', module_count: 4 }])
    })

    await renderCatalog({
      routeQuery: { progress_status: 'not_started' },
      user: null
    })

    expect(await screen.findByText('AWS práctico')).toBeInTheDocument()
    expect(screen.queryByText('Estado mi progreso')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Sin empezar/ })).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/roadmaps',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    await waitFor(() => expect(nextRouterMock.replace).toHaveBeenCalledWith(
      { pathname: '/roadmaps', query: {} },
      undefined,
      { shallow: true, scroll: false }
    ))
  })

  it('shows and applies the progress status filter for authenticated users', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async url => {
      if (String(url).startsWith('/api/roadmaps/metadata')) {
        return jsonResponse({
          categories: [{ key: 'cloud-y-devops', label: 'Cloud y DevOps', roadmap_count: 3 }],
          topics: [],
          levels: [{ key: 'beginner', roadmap_count: 3 }],
          progress_statuses: [
            { key: 'not_started', label: 'Sin empezar', roadmap_count: 2 },
            { key: 'in_progress', label: 'En curso', roadmap_count: 1 },
            { key: 'completed', label: 'Completados', roadmap_count: 0 }
          ]
        })
      }
      return jsonResponse([{ id: 1, title: 'AWS práctico', module_count: 4 }])
    })

    await renderCatalog({
      user: { id: 2, email: 'ana@plexus.es', role: 'user' }
    })

    expect(await screen.findByText('Estado mi progreso')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /En curso/ }))
    expect(nextRouterMock.replace).toHaveBeenCalledWith(
      { pathname: '/roadmaps', query: { progress_status: ['in_progress'] } },
      undefined,
      { shallow: true, scroll: false }
    )
  })

  it('updates filter counts dynamically when searching and selecting filters', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async url => {
      const urlStr = String(url)
      if (urlStr === '/api/roadmaps/metadata') {
        return jsonResponse({
          categories: [
            { key: 'aws', label: 'AWS', roadmap_count: 1 },
            { key: 'desarrollo', label: 'Desarrollo', roadmap_count: 1 }
          ],
          topics: [{ key: 'aws', label: 'AWS', roadmap_count: 2 }],
          levels: [{ key: 'beginner', roadmap_count: 3 }],
          duration_ranges: [
            { key: 'up-to-4', label: 'Hasta 4 semanas', roadmap_count: 2 },
            { key: '5-to-12', label: '5-12 semanas', roadmap_count: 1 },
            { key: 'over-12', label: 'Más de 12 semanas', roadmap_count: 0 }
          ]
        })
      }
      if (urlStr === '/api/roadmaps/metadata?q=AWS') {
        return jsonResponse({
          categories: [
            { key: 'aws', label: 'AWS', roadmap_count: 1 },
            { key: 'desarrollo', label: 'Desarrollo', roadmap_count: 0 }
          ],
          topics: [{ key: 'aws', label: 'AWS', roadmap_count: 2 }],
          levels: [{ key: 'beginner', roadmap_count: 2 }],
          duration_ranges: [
            { key: 'up-to-4', label: 'Hasta 4 semanas', roadmap_count: 1 },
            { key: '5-to-12', label: '5-12 semanas', roadmap_count: 1 },
            { key: 'over-12', label: 'Más de 12 semanas', roadmap_count: 0 }
          ]
        })
      }
      if (urlStr === '/api/roadmaps/metadata?q=AWS&duration=up-to-4') {
        return jsonResponse({
          categories: [
            { key: 'aws', label: 'AWS', roadmap_count: 1 },
            { key: 'desarrollo', label: 'Desarrollo', roadmap_count: 0 }
          ],
          topics: [{ key: 'aws', label: 'AWS', roadmap_count: 1 }],
          levels: [{ key: 'beginner', roadmap_count: 1 }],
          duration_ranges: [
            { key: 'up-to-4', label: 'Hasta 4 semanas', roadmap_count: 1 },
            { key: '5-to-12', label: '5-12 semanas', roadmap_count: 1 },
            { key: 'over-12', label: 'Más de 12 semanas', roadmap_count: 0 }
          ]
        })
      }
      if (urlStr.includes('duration=up-to-4')) {
        return jsonResponse([{ id: 4, title: 'De 0 a 100 en AWS en 14 días', module_count: 1 }])
      }
      if (urlStr.includes('q=AWS')) {
        return jsonResponse([
          { id: 1, title: 'Roadmap AWS gratuito', module_count: 12 },
          { id: 4, title: 'De 0 a 100 en AWS en 14 días', module_count: 1 }
        ])
      }
      return jsonResponse([
        { id: 1, title: 'Roadmap AWS gratuito', module_count: 12 },
        { id: 4, title: 'De 0 a 100 en AWS en 14 días', module_count: 1 },
        { id: 5, title: 'Roadmap de ejemplo', module_count: 1 }
      ])
    })

    const { RoadmapsPage, rerender } = await renderCatalog()
    expect(await screen.findByText('Roadmap de ejemplo')).toBeInTheDocument()
    expect(await screen.findByRole('checkbox', { name: /Hasta 4 semanas\s*\(2\)/ })).toBeInTheDocument()

    // Search "AWS" -> duration "Hasta 4 semanas" updates from (2) to (1)
    nextRouterMock.query = { q: 'AWS' }
    nextRouterMock.asPath = '/roadmaps?q=AWS'
    rerender(<RoadmapsPage />)

    expect(await screen.findByRole('checkbox', { name: /Hasta 4 semanas\s*\(1\)/ })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/roadmaps/metadata?q=AWS',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )

    // Select duration "Hasta 4 semanas" -> requests filtered metadata with q=AWS&duration=up-to-4
    nextRouterMock.query = { q: 'AWS', duration: ['up-to-4'] }
    nextRouterMock.asPath = '/roadmaps?q=AWS&duration=up-to-4'
    rerender(<RoadmapsPage />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/roadmaps/metadata?q=AWS&duration=up-to-4',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    ))
    expect(await screen.findByRole('checkbox', { name: /Hasta 4 semanas\s*\(1\)/ })).toBeChecked()
    expect(await screen.findByText('1 resultado')).toBeInTheDocument()
  })

  it('refreshes catalog metadata and filter options after creating a roadmap', async () => {
    let created = false
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const urlStr = String(input)
      if (urlStr === '/api/roadmaps' && init?.method === 'POST') {
        created = true
        return jsonResponse({ id: 9, title: 'Nuevo roadmap Cloud', module_count: 0 }, 201)
      }
      if (urlStr === '/api/roadmaps/metadata') {
        return jsonResponse(
          created
            ? {
                categories: [
                  { key: 'backend', label: 'Backend', roadmap_count: 1 },
                  { key: 'cloud', label: 'Cloud', roadmap_count: 1 }
                ],
                topics: [{ key: 'kubernetes', label: 'Kubernetes', roadmap_count: 1 }],
                levels: [{ key: 'beginner', roadmap_count: 2 }],
                duration_ranges: [
                  { key: 'up-to-4', label: 'Hasta 4 semanas', roadmap_count: 2 },
                  { key: '5-to-12', label: '5-12 semanas', roadmap_count: 0 },
                  { key: 'over-12', label: 'Más de 12 semanas', roadmap_count: 0 }
                ]
              }
            : {
                categories: [{ key: 'backend', label: 'Backend', roadmap_count: 1 }],
                topics: [],
                levels: [{ key: 'beginner', roadmap_count: 1 }],
                duration_ranges: [
                  { key: 'up-to-4', label: 'Hasta 4 semanas', roadmap_count: 1 },
                  { key: '5-to-12', label: '5-12 semanas', roadmap_count: 0 },
                  { key: 'over-12', label: 'Más de 12 semanas', roadmap_count: 0 }
                ]
              }
        )
      }
      return jsonResponse(
        created
          ? [
              { id: 1, title: 'Roadmap inicial', module_count: 2 },
              { id: 9, title: 'Nuevo roadmap Cloud', module_count: 0 }
            ]
          : [{ id: 1, title: 'Roadmap inicial', module_count: 2 }]
      )
    })

    await renderCatalog({ isAdmin: true })
    expect(await screen.findByText('Roadmap inicial')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Cloud/ })).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Título del roadmap'), {
      target: { value: 'Nuevo roadmap Cloud' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear roadmap' }))

    expect(await screen.findByRole('checkbox', { name: /Cloud\s*\(1\)/ })).toBeInTheDocument()
    expect(await screen.findByText('Nuevo roadmap Cloud')).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/roadmaps/metadata')).toHaveLength(2)
  })
})
