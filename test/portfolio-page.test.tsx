import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

const normalUser = { id: 5, email: 'user@example.com', role: 'user' as const }

const basePortfolio = {
  user: { id: 5, name: 'Ada', email: 'user@example.com' },
  total_evidences: 2,
  approved_evidences: 1,
  roadmaps: [
    {
      id: 10,
      title: 'DevOps Junior',
      items: [
        {
          id: 1,
          module_id: 7,
          module_title: 'CI/CD',
          module_position: 2,
          roadmap_id: 10,
          roadmap_title: 'DevOps Junior',
          evidence_type: 'github',
          url: 'https://github.com/example/project',
          note: 'Incluye pipeline completo.',
          review_status: 'aprobado',
          admin_comment: 'Buen trabajo, sigue así.',
          reviewed_at: '2026-07-21T10:00:00.000Z',
          updated_at: '2026-07-20T10:00:00.000Z'
        },
        {
          id: 2,
          module_id: 8,
          module_title: 'Monitorización',
          module_position: 3,
          roadmap_id: 10,
          roadmap_title: 'DevOps Junior',
          evidence_type: 'weird-type',
          url: null,
          note: null,
          review_status: 'requiere_cambios',
          admin_comment: null,
          reviewed_at: null,
          updated_at: '2026-07-22T10:00:00.000Z'
        }
      ]
    }
  ]
}

describe('portfolio page', () => {
  beforeEach(() => {
    cleanup()
    vi.resetModules()
    setRouter('/portfolio')
    mockAuth()
  })

  it('shows the loading state while auth is resolving', async () => {
    mockAuth({ loading: true })
    const PortfolioPage = (await import('../pages/portfolio')).default
    render(<PortfolioPage />)
    expect(screen.getByText('Cargando portfolio...')).toBeInTheDocument()
  })

  it('keeps loading indefinitely when there is no session and never calls fetch', async () => {
    mockAuth({ user: null })
    const fetchMock = vi.spyOn(global, 'fetch')
    const PortfolioPage = (await import('../pages/portfolio')).default
    render(<PortfolioPage />)
    expect(screen.getByText('Cargando portfolio...')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('redirects to login when the API responds 401', async () => {
    mockAuth({ user: normalUser })
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}, 401))
    const PortfolioPage = (await import('../pages/portfolio')).default
    render(<PortfolioPage />)

    await waitFor(() => {
      expect(nextRouterMock.push).toHaveBeenCalledWith('/login?next=%2Fportfolio')
    })
  })

  it('shows a server error message when the API responds with an error payload', async () => {
    mockAuth({ user: normalUser })
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ error: 'Fallo interno inesperado.' }, 500))
    const PortfolioPage = (await import('../pages/portfolio')).default
    render(<PortfolioPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo interno inesperado.')
  })

  it('falls back to a generic error message when the error body cannot be parsed', async () => {
    mockAuth({ user: normalUser })
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error('bad json'))
    } as any)
    const PortfolioPage = (await import('../pages/portfolio')).default
    render(<PortfolioPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el portfolio.')
  })

  it('shows a connection error message when fetch throws', async () => {
    mockAuth({ user: normalUser })
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    const PortfolioPage = (await import('../pages/portfolio')).default
    render(<PortfolioPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor.')
  })

  it('shows the empty state with a link to explore roadmaps when there are no evidences', async () => {
    mockAuth({ user: normalUser })
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({
      user: { id: 5, name: null, email: 'user@example.com' },
      total_evidences: 0,
      approved_evidences: 0,
      roadmaps: []
    }))
    const PortfolioPage = (await import('../pages/portfolio')).default
    render(<PortfolioPage />)

    expect(await screen.findByText('Aún no has registrado evidencias')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explorar Roadmaps' })).toHaveAttribute('href', '/roadmaps')
    expect(screen.queryByText('Exportar en Markdown (.md)')).not.toBeInTheDocument()
  })

  it('renders roadmaps with evidences, review badges, feedback and the export link', async () => {
    mockAuth({ user: normalUser })
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(basePortfolio))
    const PortfolioPage = (await import('../pages/portfolio')).default
    render(<PortfolioPage />)

    expect(await screen.findByText('DevOps Junior')).toBeInTheDocument()
    expect(screen.getByText('Entregables registrados').previousElementSibling).toHaveTextContent('2')
    expect(screen.getByText('Aprobados por mentores').previousElementSibling).toHaveTextContent('1')

    // aprobado badge + github label + url + note + admin_comment
    expect(screen.getByText('Aprobado ✓')).toBeInTheDocument()
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /github.com\/example\/project/ })).toHaveAttribute(
      'href',
      'https://github.com/example/project'
    )
    expect(screen.getByText('Incluye pipeline completo.')).toBeInTheDocument()
    expect(screen.getByText('Buen trabajo, sigue así.')).toBeInTheDocument()

    // requiere_cambios badge + unknown type fallback label + missing url/note/comment
    expect(screen.getByText('Requiere cambios ⚠️')).toBeInTheDocument()
    expect(screen.getByText('weird-type')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'Exportar en Markdown (.md)' })).toHaveAttribute(
      'href',
      '/api/portfolio/export'
    )

    const moduleLinks = screen.getAllByRole('link', { name: 'Ir al módulo →' })
    expect(moduleLinks[0]).toHaveAttribute('href', '/modules/7')
  })

  it('shows the default pending badge for an unknown review status', async () => {
    mockAuth({ user: normalUser })
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({
      user: { id: 5, name: 'Ada', email: 'user@example.com' },
      total_evidences: 1,
      approved_evidences: 0,
      roadmaps: [
        {
          id: 11,
          title: 'AWS Roadmap',
          items: [
            {
              id: 3,
              module_id: 9,
              module_title: 'IAM',
              module_position: 1,
              roadmap_id: 11,
              roadmap_title: 'AWS Roadmap',
              evidence_type: 'note',
              url: null,
              note: null,
              review_status: 'pendiente',
              admin_comment: null,
              reviewed_at: null,
              updated_at: '2026-07-25T10:00:00.000Z'
            }
          ]
        }
      ]
    }))
    const PortfolioPage = (await import('../pages/portfolio')).default
    render(<PortfolioPage />)

    expect(await screen.findByText('Pendiente de revisión ⏳')).toBeInTheDocument()
    expect(screen.getByText('Nota')).toBeInTheDocument()
  })
})
