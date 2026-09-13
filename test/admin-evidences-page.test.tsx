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

describe('admin evidences page', () => {
  beforeEach(() => {
    cleanup()
    vi.resetModules()
    setRouter('/admin/evidences')
    mockAuth()
  })

  it('shows the loading state while permissions are being checked', async () => {
    mockAuth({ loading: true })
    const EvidencesPage = (await import('../pages/admin/evidences')).default
    render(<EvidencesPage />)
    expect(screen.getByText('Comprobando permisos...')).toBeInTheDocument()
  })

  it('shows a loading label for rows and then an empty state when there are none', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    let resolveFetch: (value: any) => void = () => {}
    vi.spyOn(global, 'fetch').mockImplementation(
      () => new Promise(resolve => { resolveFetch = resolve })
    )
    const EvidencesPage = (await import('../pages/admin/evidences')).default
    render(<EvidencesPage />)

    expect(screen.getByText('Cargando evidencias...')).toBeInTheDocument()
    resolveFetch(jsonResponse([]))

    expect(await screen.findByText('No hay evidencias en este estado.')).toBeInTheDocument()
  })

  it('shows a server error message when loading evidences fails', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ error: 'No autorizado.' }, 403))
    const EvidencesPage = (await import('../pages/admin/evidences')).default
    render(<EvidencesPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No autorizado.')
  })

  it('shows a connection error message when the request throws', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    const EvidencesPage = (await import('../pages/admin/evidences')).default
    render(<EvidencesPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor.')
  })

  it('filters by status using the filter buttons', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse([]))
    const EvidencesPage = (await import('../pages/admin/evidences')).default
    render(<EvidencesPage />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/evidences'))

    fireEvent.click(screen.getByRole('button', { name: 'Pendientes' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/evidences?status=pendiente'))

    fireEvent.click(screen.getByRole('button', { name: 'Aprobadas' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/evidences?status=aprobado'))

    fireEvent.click(screen.getByRole('button', { name: 'Requiere cambios' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/evidences?status=requiere_cambios'))

    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/evidences'))
  })

  it('renders evidences without url, note or user name, using the requiere_cambios badge', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse([
      {
        id: 4,
        evidence_type: 'demo',
        url: null,
        note: null,
        review_status: 'requiere_cambios',
        admin_comment: null,
        updated_at: '2026-07-20T10:00:00.000Z',
        user_email: 'anon@example.com',
        user_name: null,
        module_id: 9,
        module_title: 'Kubernetes',
        roadmap_title: 'DevOps Junior'
      }
    ]))
    const EvidencesPage = (await import('../pages/admin/evidences')).default
    render(<EvidencesPage />)

    expect(await screen.findByText('Requiere cambios')).toBeInTheDocument()
    expect(screen.getByText('Sin nombre · anon@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Abrir evidencia' })).not.toBeInTheDocument()
  })

  it('approves, requests changes and resets an evidence, editing the review comment', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    const evidence = {
      id: 3,
      evidence_type: 'github',
      url: 'https://github.com/example/project',
      note: 'Incluye pipeline.',
      review_status: 'pendiente',
      admin_comment: '',
      updated_at: '2026-07-20T10:00:00.000Z',
      user_email: 'user@example.com',
      user_name: 'Ada',
      module_id: 7,
      module_title: 'CI/CD',
      roadmap_title: 'DevOps Junior'
    }
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      if (init?.method === 'PUT') return jsonResponse({ ok: true })
      return jsonResponse([evidence])
    })
    const EvidencesPage = (await import('../pages/admin/evidences')).default
    render(<EvidencesPage />)

    expect(await screen.findByText('CI/CD')).toBeInTheDocument()

    const textarea = screen.getByPlaceholderText('Escribe aquí las observaciones o correcciones para el alumno...')
    fireEvent.change(textarea, { target: { value: 'Buen trabajo' } })
    expect(textarea).toHaveValue('Buen trabajo')

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/evidences/3/review', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ review_status: 'aprobado', admin_comment: 'Buen trabajo' })
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'Solicitar cambios' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/evidences/3/review', expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('"requiere_cambios"')
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'Restablecer a Pendiente' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/evidences/3/review', expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('"pendiente"')
      }))
    })
  })

  it('shows an error message when the review request fails', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    const evidence = {
      id: 5,
      evidence_type: 'document',
      url: null,
      note: null,
      review_status: 'pendiente',
      admin_comment: '',
      updated_at: '2026-07-20T10:00:00.000Z',
      user_email: 'user@example.com',
      user_name: 'Ada',
      module_id: 7,
      module_title: 'CI/CD',
      roadmap_title: 'DevOps Junior'
    }
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      if (init?.method === 'PUT') return jsonResponse({ error: 'No se pudo guardar.' }, 400)
      return jsonResponse([evidence])
    })
    const EvidencesPage = (await import('../pages/admin/evidences')).default
    render(<EvidencesPage />)

    expect(await screen.findByText('CI/CD')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar.')
  })

  it('shows a connection error message when the review request throws', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    const evidence = {
      id: 6,
      evidence_type: 'note',
      url: null,
      note: null,
      review_status: 'pendiente',
      admin_comment: '',
      updated_at: '2026-07-20T10:00:00.000Z',
      user_email: 'user@example.com',
      user_name: 'Ada',
      module_id: 7,
      module_title: 'CI/CD',
      roadmap_title: 'DevOps Junior'
    }
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      if (init?.method === 'PUT') throw new Error('network down')
      return jsonResponse([evidence])
    })
    const EvidencesPage = (await import('../pages/admin/evidences')).default
    render(<EvidencesPage />)

    expect(await screen.findByText('CI/CD')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Error al comunicar con el servidor.')
  })
})
