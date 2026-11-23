import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
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

async function renderProfilePage(options: {
  user?: { id: number; email: string; name?: string | null; role: 'admin' | 'user' } | null
  authLoading?: boolean
} = {}) {
  nextRouterMock.pathname = '/profile'
  nextRouterMock.asPath = '/profile'
  nextRouterMock.query = {}
  nextRouterMock.push.mockResolvedValue(true)

  vi.doMock('../components/AuthProvider', () => ({
    useAuth: () => ({
      user: options.user ?? null,
      isAdmin: options.user?.role === 'admin',
      loading: Boolean(options.authLoading),
      refresh: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined)
    })
  }))

  const ProfilePage = (await import('../pages/profile')).default
  return render(<ProfilePage />)
}

describe('profile page', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('redirects anonymous visitors to login', async () => {
    await renderProfilePage({ user: null, authLoading: false })

    await waitFor(() => expect(nextRouterMock.push).toHaveBeenCalledWith('/login?next=%2Fprofile'))
  })

  it('renders user account details and activity metrics without a bottom logout button', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async input => {
      const url = String(input)
      if (url === '/api/progress/roadmaps') {
        return jsonResponse([
          {
            id: 1,
            roadmap_id: 1,
            title: 'Roadmap AWS',
            status: 'in_progress',
            completed_lessons_count: 14,
            time_spent_seconds: 5400,
            quiz_attempts_count: 2,
            average_quiz_percentage: 85
          },
          {
            id: 2,
            roadmap_id: 2,
            title: 'Roadmap DevOps',
            status: 'completed',
            completed_lessons_count: 10,
            time_spent_seconds: 1800,
            quiz_attempts_count: 0,
            average_quiz_percentage: null
          }
        ])
      }
      if (url === '/api/portfolio') {
        return jsonResponse({
          total_evidences: 3,
          approved_evidences: 2,
          roadmaps: []
        })
      }
      return jsonResponse({})
    })

    await renderProfilePage({
      user: { id: 7, email: 'ana.garcia@plexus.es', name: 'Ana García', role: 'user' }
    })

    expect(await screen.findByText('Información de la cuenta')).toBeInTheDocument()
    expect(screen.getByText('Ana García')).toBeInTheDocument()
    expect(screen.getByText('ana.garcia@plexus.es')).toBeInTheDocument()
    expect(screen.getAllByText('ana.garcia').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Alumno').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('#7')).toBeInTheDocument()

    expect(await screen.findByText('24')).toBeInTheDocument()
    expect(screen.getByText('2 h')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument()
    expect(screen.getByText('2/3')).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
  })
})
