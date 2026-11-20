import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body)
  } as any
}

function mockAdminAuth() {
  const authState = {
    user: { id: 1, email: 'admin@example.com', role: 'admin' as const },
    loading: false,
    isAdmin: true,
    refresh: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined)
  }

  vi.doMock('../components/AuthProvider', () => ({
    AuthProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    useAuth: () => authState
  }))
}

describe('admin audit page search and filters', () => {
  beforeEach(() => {
    cleanup()
    vi.resetModules()
  })

  it('filters audit events by search query, entity, action and actor and resets filters', async () => {
    mockAdminAuth()
    const logs = [
      {
        id: 1,
        actor_email: 'mentor@plexus.es',
        action: 'user.create',
        entity_type: 'user',
        entity_id: '42',
        details: '{"email":"elena@plexus.es"}',
        ip_address: '10.0.0.5',
        created_at: '2026-06-01T10:00:00.000Z'
      },
      {
        id: 2,
        actor_email: 'admin2@plexus.es',
        action: 'roadmap.update',
        entity_type: 'roadmap',
        entity_id: '7',
        details: '{"title":"Kubernetes avanzado"}',
        ip_address: '192.168.1.20',
        created_at: '2026-06-01T11:00:00.000Z'
      },
      {
        id: 3,
        actor_email: null,
        action: 'roadmap.seed',
        entity_type: 'roadmap',
        entity_id: '1',
        details: 'seed automatico inicial',
        ip_address: null,
        created_at: '2026-06-01T09:00:00.000Z'
      }
    ]

    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(logs))

    const AuditPage = (await import('../pages/admin/audit')).default
    render(<AuditPage />)

    expect(await screen.findByText('user.create')).toBeInTheDocument()
    expect(screen.getByText('3 eventos')).toBeInTheDocument()

    // Search matching JSON details / IP / ID
    fireEvent.change(screen.getByLabelText('Buscar en auditoría'), { target: { value: '192.168.1.20' } })
    expect(screen.getByText('roadmap.update')).toBeInTheDocument()
    expect(screen.queryByText('user.create')).not.toBeInTheDocument()
    expect(screen.queryByText('roadmap.seed')).not.toBeInTheDocument()
    expect(screen.getByText('Mostrando 1 de 3 eventos')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(screen.getByText('user.create')).toBeInTheDocument()
    expect(screen.getByText('3 eventos')).toBeInTheDocument()

    // Entity filter -> roadmap
    fireEvent.change(screen.getByLabelText('Filtrar por entidad'), { target: { value: 'roadmap' } })
    expect(screen.queryByText('user.create')).not.toBeInTheDocument()
    expect(screen.getByText('roadmap.update')).toBeInTheDocument()
    expect(screen.getByText('roadmap.seed')).toBeInTheDocument()

    // Combine with system actor filter -> only roadmap.seed
    fireEvent.change(screen.getByLabelText('Filtrar por actor'), { target: { value: '__system__' } })
    expect(screen.queryByText('roadmap.update')).not.toBeInTheDocument()
    expect(screen.getByText('roadmap.seed')).toBeInTheDocument()

    // Action filter incompatible with current actor/entity -> empty filter state
    fireEvent.change(screen.getByLabelText('Filtrar por acción'), { target: { value: 'user.create' } })
    expect(screen.getByText('No hay eventos que coincidan con los filtros actuales.')).toBeInTheDocument()
    expect(screen.getByText('Mostrando 0 de 3 eventos')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(screen.getByText('user.create')).toBeInTheDocument()
    expect(screen.getByText('roadmap.update')).toBeInTheDocument()
    expect(screen.getByText('roadmap.seed')).toBeInTheDocument()

    // Filter directly by action
    fireEvent.change(screen.getByLabelText('Filtrar por acción'), { target: { value: 'user.create' } })
    expect(screen.getByText('user.create')).toBeInTheDocument()
    expect(screen.queryByText('roadmap.update')).not.toBeInTheDocument()
  })

  it('shows the empty audit message when there are no events', async () => {
    mockAdminAuth()
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse([]))

    const AuditPage = (await import('../pages/admin/audit')).default
    render(<AuditPage />)

    expect(await screen.findByText('Todavía no hay eventos de auditoría.')).toBeInTheDocument()
    expect(screen.getByText('0 eventos')).toBeInTheDocument()
  })
})
