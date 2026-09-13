import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type AuthState = {
  user: any
  loading: boolean
  isAdmin: boolean
  refresh: ReturnType<typeof vi.fn>
  logout: ReturnType<typeof vi.fn>
}

let authState: AuthState
const nextRouterMock = (globalThis as any).__NEXT_ROUTER_MOCK__ as {
  asPath: string
  pathname: string
  push: ReturnType<typeof vi.fn>
  query: Record<string, unknown>
}

function mockAuth(overrides: Partial<AuthState> = {}) {
  authState = {
    user: null,
    loading: false,
    isAdmin: false,
    refresh: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }

  vi.doMock('../components/AuthProvider', () => ({
    AuthProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    useAuth: () => authState
  }))

  return authState
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body)
  } as any
}

function setRouter(pathname: string, query: Record<string, unknown> = {}) {
  nextRouterMock.pathname = pathname
  nextRouterMock.asPath = pathname
  nextRouterMock.query = query
}

const adminUser = { id: 1, email: 'admin@example.com', role: 'admin' as const }

describe('admin import roadmap page', () => {
  beforeEach(() => {
    cleanup()
    vi.resetModules()
    setRouter('/admin/import-roadmap')
    mockAuth({ user: adminUser, isAdmin: true })
  })

  it('rejects a file larger than 1MB without calling fetch', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
    const ImportPage = (await import('../pages/admin/import-roadmap')).default
    render(<ImportPage />)

    const bigContent = 'a'.repeat(1024 * 1024 + 1)
    const file = new File([bigContent], 'roadmap.json', { type: 'application/json' })
    const input = screen.getByLabelText('Seleccionar archivo JSON') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('El archivo no puede superar 1 MB.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('loads a selected JSON file into the textarea and resets previous results', async () => {
    const ImportPage = (await import('../pages/admin/import-roadmap')).default
    render(<ImportPage />)

    const content = JSON.stringify({ title: 'Desde archivo' })
    const file = new File([content], 'roadmap.json', { type: 'application/json' })
    const input = screen.getByLabelText('Seleccionar archivo JSON') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByLabelText('Contenido JSON')).toHaveValue(content)
    })
  })

  it('does nothing when the file input change fires without a file', async () => {
    const ImportPage = (await import('../pages/admin/import-roadmap')).default
    render(<ImportPage />)

    const input = screen.getByLabelText('Seleccionar archivo JSON') as HTMLInputElement
    fireEvent.change(input, { target: { files: [] } })

    expect(screen.getByLabelText('Contenido JSON')).toHaveValue('')
  })

  it('shows a connection error message when the preview request throws', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    const ImportPage = (await import('../pages/admin/import-roadmap')).default
    render(<ImportPage />)

    fireEvent.change(screen.getByLabelText('Contenido JSON'), { target: { value: '{"title":"Ruta"}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validar y previsualizar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo conectar con el servidor para validar el roadmap.'
    )
  })

  it('falls back to an empty issues list when the server omits it', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ error: 'El roadmap contiene errores.' }, 400))
    const ImportPage = (await import('../pages/admin/import-roadmap')).default
    render(<ImportPage />)

    fireEvent.change(screen.getByLabelText('Contenido JSON'), { target: { value: '{"title":"Ruta"}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validar y previsualizar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El roadmap contiene errores.')
    expect(screen.queryByText('Errores que debes corregir')).not.toBeInTheDocument()
  })

  it('previews an existing roadmap with missing optional fields and offers to update it', async () => {
    const normalized = {
      title: 'Roadmap sin extras',
      description: '',
      duration: '',
      category: '',
      topics: [],
      modules: [{ position: 0, title: 'Fundamentos', duration: '' }]
    }
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ roadmap: normalized, existing: { id: 9, title: 'Roadmap sin extras' } })
    )
    const ImportPage = (await import('../pages/admin/import-roadmap')).default
    render(<ImportPage />)

    fireEvent.change(screen.getByLabelText('Contenido JSON'), { target: { value: JSON.stringify(normalized) } })
    fireEvent.click(screen.getByRole('button', { name: 'Validar y previsualizar' }))

    expect(await screen.findByText('Vista previa válida')).toBeInTheDocument()
    expect(screen.getByText('Sin descripción')).toBeInTheDocument()
    expect(screen.getByText('Sin clasificar')).toBeInTheDocument()
    expect(screen.getByText('Por definir')).toBeInTheDocument()
    expect(screen.getByText('Sin temas')).toBeInTheDocument()
    expect(screen.getByText(
      'Ya existe un roadmap con este título. Se actualizarán sus datos y módulos coincidentes sin eliminar contenido.'
    )).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actualizar roadmap' })).toBeInTheDocument()
  })

  it('shows a server error message when publishing fails', async () => {
    const normalized = {
      title: 'Roadmap de ejemplo',
      description: 'desc',
      duration: '2 semanas',
      category: 'Desarrollo',
      topics: ['TypeScript'],
      modules: [{ position: 0, title: 'Fundamentos', duration: '2 semanas' }]
    }
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ roadmap: normalized, existing: null }))
      .mockResolvedValueOnce(jsonResponse({ error: 'No se pudo publicar el roadmap.' }, 500))
    const ImportPage = (await import('../pages/admin/import-roadmap')).default
    render(<ImportPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Cargar ejemplo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Validar y previsualizar' }))
    expect(await screen.findByText('Vista previa válida')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Publicar roadmap' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo publicar el roadmap.')
  })

  it('shows a connection error message when publishing throws', async () => {
    const normalized = {
      title: 'Roadmap de ejemplo',
      description: 'desc',
      duration: '2 semanas',
      category: 'Desarrollo',
      topics: ['TypeScript'],
      modules: [{ position: 0, title: 'Fundamentos', duration: '2 semanas' }]
    }
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ roadmap: normalized, existing: null }))
      .mockRejectedValueOnce(new Error('network down'))
    const ImportPage = (await import('../pages/admin/import-roadmap')).default
    render(<ImportPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Cargar ejemplo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Validar y previsualizar' }))
    expect(await screen.findByText('Vista previa válida')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Publicar roadmap' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo conectar con el servidor para publicar el roadmap.'
    )
  })
})
