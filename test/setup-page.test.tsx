import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body)
  } as any
}

function mockAuth(auth: { user?: { id: number; email: string; role: 'admin' | 'user' } | null; isAdmin?: boolean } = {}) {
  const authState = {
    user: auth.user ?? null,
    loading: false,
    isAdmin: Boolean(auth.isAdmin),
    refresh: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined)
  }

  vi.doMock('../components/AuthProvider', () => ({
    AuthProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    useAuth: () => authState
  }))
}

describe('setup page completed links', () => {
  beforeEach(() => {
    cleanup()
    vi.resetModules()
  })

  it('links admins to the users panel, regular users to roadmaps, and guests to login', async () => {
    const setupDone = {
      needsSetup: false,
      requiresToken: false,
      productionRequiresToken: false
    }

    mockAuth({ user: { id: 1, email: 'admin@example.com', role: 'admin' }, isAdmin: true })
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(setupDone))

    const AdminSetupPage = (await import('../pages/setup')).default
    render(<AdminSetupPage />)

    expect(await screen.findByRole('link', { name: 'Ir al panel de usuarios' })).toHaveAttribute('href', '/admin/users')
    expect(screen.queryByRole('link', { name: 'Ir al login' })).not.toBeInTheDocument()

    cleanup()
    vi.resetModules()
    mockAuth({ user: { id: 2, email: 'user@example.com', role: 'user' }, isAdmin: false })
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(setupDone))

    const UserSetupPage = (await import('../pages/setup')).default
    render(<UserSetupPage />)

    expect(await screen.findByRole('link', { name: 'Ir a los roadmaps' })).toHaveAttribute('href', '/roadmaps')
    expect(screen.queryByRole('link', { name: 'Ir al login' })).not.toBeInTheDocument()

    cleanup()
    vi.resetModules()
    mockAuth({ user: null, isAdmin: false })
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(setupDone))

    const GuestSetupPage = (await import('../pages/setup')).default
    render(<GuestSetupPage />)

    expect(await screen.findByRole('link', { name: 'Ir al login' })).toHaveAttribute('href', '/login')
  })
})
