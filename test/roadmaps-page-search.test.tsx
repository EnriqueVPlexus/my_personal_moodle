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
} = {}) {
  nextRouterMock.pathname = '/roadmaps'
  nextRouterMock.asPath = options.query ? `/roadmaps?q=${encodeURIComponent(options.query)}` : '/roadmaps'
  nextRouterMock.query = options.routeQuery ?? (options.query ? { q: options.query } : {})
  nextRouterMock.replace.mockResolvedValue(true)
  nextRouterMock.push.mockResolvedValue(true)

  vi.doMock('../components/AuthProvider', () => ({
    useAuth: () => ({ isAdmin: Boolean(options.isAdmin) })
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
    expect(screen.queryByText('Catálogo completo')).not.toBeInTheDocument()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/roadmaps?q=AWS',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    ))
    expect(await screen.findByText('AWS práctico')).toBeInTheDocument()
    expect(nextRouterMock.replace).toHaveBeenCalledWith(
      { pathname: '/roadmaps', query: { q: 'AWS' } },
      undefined,
      { shallow: true }
    )

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
    expect(await screen.findByText('Catálogo completo')).toBeInTheDocument()
    expect(nextRouterMock.replace).toHaveBeenLastCalledWith(
      { pathname: '/roadmaps', query: {} },
      undefined,
      { shallow: true }
    )
  })

  it('aborts an obsolete request so a newer result wins', async () => {
    let awsSignal: AbortSignal | undefined
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).includes('?q=AWS')) {
        awsSignal = init?.signal as AbortSignal
        return new Promise(() => {})
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
      String(url) === '/api/roadmaps/metadata'
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

    fetchMock
      .mockRejectedValueOnce(new TypeError('network error'))
      .mockResolvedValueOnce(jsonResponse([{ id: 3, title: 'Recuperado', module_count: 3 }]))
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
      if (String(url) === '/api/roadmaps/metadata') {
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
      { shallow: true }
    )

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar todo' }))
    expect(nextRouterMock.replace).toHaveBeenLastCalledWith(
      { pathname: '/roadmaps', query: {} },
      undefined,
      { shallow: true }
    )
  })
})
