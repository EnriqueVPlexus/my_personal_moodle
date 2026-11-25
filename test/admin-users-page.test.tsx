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

  it('hides the creation form until "Crear usuario" is clicked and shows an error when creation fails', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      if (init?.method === 'POST') return jsonResponse({ error: 'email already exists' }, 409)
      return jsonResponse([])
    })
    const AdminUsersPage = (await import('../pages/admin/users')).default
    render(<AdminUsersPage />)

    expect(await screen.findByText('Cuentas existentes')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('email@empresa.com')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))
    expect(screen.getByPlaceholderText('email@empresa.com')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('email@empresa.com'), { target: { value: 'dup@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Contraseña de al menos 12 caracteres'), { target: { value: 'valid-password-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(await screen.findByText('email already exists')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByPlaceholderText('email@empresa.com')).not.toBeInTheDocument()
  })

  it('collapses user cards by default, expands on click, disables self-deactivation and allows toggling others off', async () => {
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
    expect(screen.getByText('User Two')).toBeInTheDocument()
    expect(screen.getAllByText('activo')).toHaveLength(2)

    // Details are hidden while collapsed
    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument()
    expect(screen.queryByText('Acceso a roadmaps')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Nueva contraseña')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('admin@example.com'))
    fireEvent.click(screen.getByText('user@example.com'))

    const deactivateButtons = screen.getAllByRole('button', { name: 'Desactivar' })
    expect(deactivateButtons).toHaveLength(2)
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

    // Clicking header again collapses the card
    fireEvent.click(screen.getByText('user@example.com'))
    expect(screen.getAllByRole('button', { name: 'Desactivar' })).toHaveLength(1)
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

    fireEvent.click(await screen.findByText('admin@example.com'))
    fireEvent.click(screen.getByText('user@example.com'))

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

    fireEvent.click(await screen.findByText('user@example.com'))
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

    fireEvent.click(await screen.findByText('user@example.com'))
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

    fireEvent.click(await screen.findByText('user@example.com'))
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

    fireEvent.click(await screen.findByText('user@example.com'))
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

    fireEvent.click(await screen.findByText('user@example.com'))
    const passwordInput = await screen.findByPlaceholderText('Nueva contraseña')
    fireEvent.change(passwordInput, { target: { value: 'short-pass-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Resetear' }))

    expect(await screen.findByText('password too weak')).toBeInTheDocument()
  })

  it('filters users by search query, role, active status and roadmap access and clears filters', async () => {
    mockAuth({ user: adminUser, isAdmin: true })
    const users = [
      {
        id: 1,
        email: 'mentor.demo@plexus.es',
        name: 'Mentor Demo',
        role: 'admin',
        is_active: 1,
        can_view_all_roadmaps: 1,
        roadmap_access_ids: [],
        created_at: '2026-05-30'
      },
      {
        id: 2,
        email: 'elena.martinez@plexus.es',
        name: 'Elena Martínez',
        role: 'user',
        is_active: 1,
        can_view_all_roadmaps: 0,
        roadmap_access_ids: [1],
        created_at: '2026-05-30'
      },
      {
        id: 3,
        email: 'carlos.lopez@plexus.es',
        name: 'Carlos López',
        role: 'user',
        is_active: 0,
        can_view_all_roadmaps: 1,
        roadmap_access_ids: [],
        created_at: '2026-05-30'
      }
    ]
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (url === '/api/roadmaps') return jsonResponse([{ id: 1, title: 'AWS' }])
      return jsonResponse(users)
    })

    const AdminUsersPage = (await import('../pages/admin/users')).default
    render(<AdminUsersPage />)

    expect(await screen.findByText('mentor.demo@plexus.es')).toBeInTheDocument()
    expect(screen.getByText('3 cuentas')).toBeInTheDocument()

    // Accent/case-insensitive search
    fireEvent.change(screen.getByLabelText('Buscar usuarios'), { target: { value: 'martinez' } })
    expect(screen.getByText('elena.martinez@plexus.es')).toBeInTheDocument()
    expect(screen.queryByText('mentor.demo@plexus.es')).not.toBeInTheDocument()
    expect(screen.queryByText('carlos.lopez@plexus.es')).not.toBeInTheDocument()
    expect(screen.getByText('Mostrando 1 de 3 cuentas')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(screen.getByText('mentor.demo@plexus.es')).toBeInTheDocument()
    expect(screen.getByText('carlos.lopez@plexus.es')).toBeInTheDocument()

    // Role filter -> admin
    fireEvent.change(screen.getByLabelText('Filtrar por rol'), { target: { value: 'admin' } })
    expect(screen.getByText('mentor.demo@plexus.es')).toBeInTheDocument()
    expect(screen.queryByText('elena.martinez@plexus.es')).not.toBeInTheDocument()
    expect(screen.queryByText('carlos.lopez@plexus.es')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    // Status filter -> inactive
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'inactive' } })
    expect(screen.getByText('carlos.lopez@plexus.es')).toBeInTheDocument()
    expect(screen.queryByText('mentor.demo@plexus.es')).not.toBeInTheDocument()
    expect(screen.queryByText('elena.martinez@plexus.es')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    // Access filter -> restricted
    fireEvent.change(screen.getByLabelText('Filtrar por acceso'), { target: { value: 'restricted' } })
    expect(screen.getByText('elena.martinez@plexus.es')).toBeInTheDocument()
    expect(screen.queryByText('mentor.demo@plexus.es')).not.toBeInTheDocument()
    expect(screen.queryByText('carlos.lopez@plexus.es')).not.toBeInTheDocument()

    // Combine incompatible filters -> empty state
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'inactive' } })
    expect(screen.getByText('No hay usuarios que coincidan con los filtros actuales.')).toBeInTheDocument()
    expect(screen.getByText('Mostrando 0 de 3 cuentas')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(screen.getByText('mentor.demo@plexus.es')).toBeInTheDocument()
    expect(screen.getByText('elena.martinez@plexus.es')).toBeInTheDocument()
    expect(screen.getByText('carlos.lopez@plexus.es')).toBeInTheDocument()
    expect(screen.getByText('3 cuentas')).toBeInTheDocument()
  })
})
