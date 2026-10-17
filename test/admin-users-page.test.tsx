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

describe('admin users page', () => {
  beforeEach(() => {
    cleanup()
    vi.resetModules()
    setRouter('/admin/users')
    mockAuth()
  })

  it('does not fetch when the users/roadmaps GET requests fail, leaving the lists empty', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ error: 'nope' }, 500))
    const AdminUsersPage = (await import('../pages/admin/users')).default
    render(<AdminUsersPage />)

    expect(await screen.findByText('Cuentas existentes')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reactivar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument()
  })

  it('shows an error message when creating a user fails', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      if (init?.method === 'POST') return jsonResponse({ error: 'email already exists' }, 409)
      return jsonResponse([])
    })
    const AdminUsersPage = (await import('../pages/admin/users')).default
    render(<AdminUsersPage />)

    fireEvent.change(screen.getByPlaceholderText('email@empresa.com'), { target: { value: 'dup@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Contraseña de al menos 12 caracteres'), { target: { value: 'valid-password-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(await screen.findByText('email already exists')).toBeInTheDocument()
  })

  it('disables the deactivate button for the current admin while active, and allows toggling others off', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    const users = [
      {
        id: 1,
        email: 'admin@example.com',
        name: 'Admin',
        role: 'admin',
        is_active: 1,
        can_view_all_roadmaps: 1,
        roadmap_access_ids: [],
        created_at: '2026-05-30'
      },
      {
        id: 2,
        email: 'user@example.com',
        name: 'User Two',
        role: 'user',
        is_active: 1,
        can_view_all_roadmaps: 1,
        roadmap_access_ids: [],
        created_at: '2026-05-30'
      }
    ]
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      if (init?.method === 'PATCH') return jsonResponse({ ok: true })
      if (url === '/api/roadmaps') return jsonResponse([])
      return jsonResponse(users)
    })
    const AdminUsersPage = (await import('../pages/admin/users')).default
    render(<AdminUsersPage />)

    expect(await screen.findByText('admin@example.com')).toBeInTheDocument()
    const deactivateButtons = screen.getAllByRole('button', { name: 'Desactivar' })
    // The current admin's own row (active) must be disabled.
    expect(deactivateButtons[0]).toBeDisabled()
    expect(deactivateButtons[1]).not.toBeDisabled()

    fireEvent.click(deactivateButtons[1])
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/users/2', expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"set_active"')
      }))
    })
  })

  it('shows an admin-only roadmap access message and hides the roadmap list when access is granted to all', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    const users = [
      {
        id: 1,
        email: 'admin@example.com',
        name: 'Admin',
        role: 'admin',
        is_active: 1,
        can_view_all_roadmaps: 1,
        roadmap_access_ids: [],
        created_at: '2026-05-30'
      },
      {
        id: 2,
        email: 'user@example.com',
        name: null,
        role: 'user',
        is_active: 1,
        can_view_all_roadmaps: 1,
        roadmap_access_ids: [],
        created_at: '2026-05-30'
      }
    ]
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (url === '/api/roadmaps') return jsonResponse([])
      return jsonResponse(users)
    })
    const AdminUsersPage = (await import('../pages/admin/users')).default
    render(<AdminUsersPage />)

    expect(await screen.findByText('Las cuentas admin pueden ver y gestionar todos los roadmaps.')).toBeInTheDocument()
    expect(screen.getByText('Puede ver todos los roadmaps')).toBeInTheDocument()
    expect(screen.queryByText('No hay roadmaps disponibles.')).not.toBeInTheDocument()
  })

  it('shows "no roadmaps available" when the user has restricted access and none exist', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    const users = [
      {
        id: 2,
        email: 'user@example.com',
        name: 'User Two',
        role: 'user',
        is_active: 1,
        can_view_all_roadmaps: 0,
        roadmap_access_ids: [],
        created_at: '2026-05-30'
      }
    ]
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (url === '/api/roadmaps') return jsonResponse([])
      return jsonResponse(users)
    })
    const AdminUsersPage = (await import('../pages/admin/users')).default
    render(<AdminUsersPage />)

    expect(await screen.findByText('No hay roadmaps disponibles.')).toBeInTheDocument()
  })

  it('toggles a roadmap checkbox off, removing it from the access list', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    const users = [
      {
        id: 2,
        email: 'user@example.com',
        name: 'User Two',
        role: 'user',
        is_active: 1,
        can_view_all_roadmaps: 0,
        roadmap_access_ids: [1],
        created_at: '2026-05-30'
      }
    ]
    const roadmaps = [{ id: 1, title: 'AWS Roadmap' }]
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      if (init?.method === 'PATCH') return jsonResponse({ ok: true })
      if (url === '/api/roadmaps') return jsonResponse(roadmaps)
      return jsonResponse(users)
    })
    const AdminUsersPage = (await import('../pages/admin/users')).default
    render(<AdminUsersPage />)

    const checkbox = await screen.findByLabelText('AWS Roadmap')
    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/users/2', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ action: 'set_roadmap_access', can_view_all_roadmaps: false, roadmap_ids: [] })
      }))
    })
  })

  it('shows an action error and does not block the UI when set_active fails', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    const users = [
      {
        id: 2,
        email: 'user@example.com',
        name: 'User Two',
        role: 'user',
        is_active: 0,
        can_view_all_roadmaps: 1,
        roadmap_access_ids: [],
        created_at: '2026-05-30'
      }
    ]
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      if (init?.method === 'PATCH') return jsonResponse({ error: 'No se pudo actualizar el usuario.' }, 400)
      if (url === '/api/roadmaps') return jsonResponse([])
      return jsonResponse(users)
    })
    const AdminUsersPage = (await import('../pages/admin/users')).default
    render(<AdminUsersPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Reactivar' }))
    expect(await screen.findByText('No se pudo actualizar el usuario.')).toBeInTheDocument()
  })

  it('shows an action error when the roadmap access update fails', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    const users = [
      {
        id: 2,
        email: 'user@example.com',
        name: 'User Two',
        role: 'user',
        is_active: 1,
        can_view_all_roadmaps: 1,
        roadmap_access_ids: [],
        created_at: '2026-05-30'
      }
    ]
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      if (init?.method === 'PATCH') return jsonResponse({ error: 'No se pudo actualizar el acceso.' }, 400)
      if (url === '/api/roadmaps') return jsonResponse([])
      return jsonResponse(users)
    })
    const AdminUsersPage = (await import('../pages/admin/users')).default
    render(<AdminUsersPage />)

    fireEvent.click(await screen.findByLabelText('Puede ver todos los roadmaps'))
    expect(await screen.findByText('No se pudo actualizar el acceso.')).toBeInTheDocument()
  })

  it('shows an action error when resetting a password fails', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    const users = [
      {
        id: 2,
        email: 'user@example.com',
        name: 'User Two',
        role: 'user',
        is_active: 1,
        can_view_all_roadmaps: 1,
        roadmap_access_ids: [],
        created_at: '2026-05-30'
      }
    ]
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      if (init?.method === 'PATCH') return jsonResponse({ error: 'password too weak' }, 400)
      if (url === '/api/roadmaps') return jsonResponse([])
      return jsonResponse(users)
    })
    const AdminUsersPage = (await import('../pages/admin/users')).default
    render(<AdminUsersPage />)

    const passwordInput = await screen.findByPlaceholderText('Nueva contraseña')
    fireEvent.change(passwordInput, { target: { value: 'short-pass-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Resetear' }))

    expect(await screen.findByText('password too weak')).toBeInTheDocument()
  })
})
