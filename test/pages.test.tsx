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

describe('Next pages', () => {
  beforeEach(() => {
    cleanup()
    vi.resetModules()
    setRouter('/')
    mockAuth()
  })

  it('renders the app wrapper and home page content', async () => {
    const App = (await import('../pages/_app')).default
    const HomePage = (await import('../pages/index')).default

    function DemoPage({ label }: { label: string }) {
      return <div>{label}</div>
    }

    render(<App Component={DemoPage as any} pageProps={{ label: 'inside app' }} /> as any)
    expect(screen.getByText('inside app')).toBeInTheDocument()

    render(<HomePage />)
    expect(screen.getByRole('heading', { name: /itinerarios formativos internos/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /explorar roadmaps/i })).toHaveAttribute('href', '/roadmaps')
    expect(screen.getByText('AWS')).toBeInTheDocument()
    expect(screen.getByText('Control de acceso por rol')).toBeInTheDocument()
  })

  it('loads roadmaps, redirects protected reads and lets admins create routes', async () => {
    setRouter('/roadmaps')
    mockAuth({ user: adminUser, isAdmin: true })

    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      if (init?.method === 'POST') return jsonResponse({ id: 2, title: 'DevOps' }, 201)
      return jsonResponse([{ id: 1, title: 'AWS Roadmap', description: 'Cloud path', module_count: 11 }])
    })

    const RoadmapsPage = (await import('../pages/roadmaps/index')).default
    render(<RoadmapsPage />)

    expect(await screen.findByText('AWS Roadmap')).toBeInTheDocument()
    expect(screen.getByText('Crear nuevo roadmap')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Título del roadmap'), { target: { value: 'DevOps' } })
    fireEvent.change(screen.getByPlaceholderText('Descripción (opcional)'), { target: { value: 'Delivery path' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear roadmap' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/roadmaps', expect.objectContaining({ method: 'POST' }))
    })

    cleanup()
    vi.resetModules()
    setRouter('/roadmaps')
    mockAuth()
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}, 401))

    const ProtectedRoadmapsPage = (await import('../pages/roadmaps/index')).default
    render(<ProtectedRoadmapsPage />)

    await waitFor(() => {
      expect(nextRouterMock.push).toHaveBeenCalledWith('/login?next=%2Froadmaps')
    })
  })

  it('renders roadmap details and reloads after adding an admin module', async () => {
    setRouter('/roadmaps/7', { id: '7' })
    mockAuth({ user: adminUser, isAdmin: true })

    const roadmap = {
      id: 7,
      title: 'AWS Roadmap',
      description: 'Cloud path',
      objectives: '["Launch AWS"]',
      methodology: ['Practicar con evidencias'],
      evaluation_weights: '{"Quiz":"20%","Laboratorio":"80%"}',
      modules: [
        {
          id: 10,
          position: 1,
          title: 'EC2',
          duration: '1 o 2 semanas',
          objective: 'Deploy compute',
          contents: '["AMI","Security groups"]',
          importance: 'Base operativa',
          official_resources: '[{"label":"Amazon EC2","url":"https://aws.amazon.com/ec2/"}]',
          support_videos: '["Curso AWS"]',
          practical_activity: '["Crear instancia"]',
          deliverable_evidence: '["Captura"]',
          evaluation: 'Revisión práctica'
        },
        {
          id: 11,
          position: 2,
          title: 'IAM',
          duration: '1 semana',
          objective: 'Gestionar accesos'
        }
      ]
    }

    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/modules' && init?.method === 'POST') return jsonResponse({ id: 99, title: 'S3' }, 201)
      return jsonResponse(roadmap)
    })

    const RoadmapDetailPage = (await import('../pages/roadmaps/[id]')).default
    render(<RoadmapDetailPage />)

    expect(await screen.findByRole('heading', { name: 'AWS Roadmap' })).toBeInTheDocument()
    expect(screen.getByText('2-3 semanas')).toBeInTheDocument()
    expect(screen.getByText('Launch AWS')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Amazon EC2/i })).toHaveAttribute('href', 'https://aws.amazon.com/ec2/')

    fireEvent.change(screen.getByPlaceholderText('Título del módulo'), { target: { value: 'S3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Añadir módulo' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/modules', expect.objectContaining({ method: 'POST' }))
    })
  })

  it('renders module details, redirects protected reads and updates lessons', async () => {
    setRouter('/modules/4', { id: '4' })
    mockAuth({ user: adminUser, isAdmin: true })

    const moduleDetail = {
      id: 4,
      title: 'EC2',
      position: 1,
      duration: '1 semana',
      objective: 'Compute foundations',
      contents: '[]',
      lessons: [
        { id: 9, title: 'SSH basics', completed: 0 },
        { id: 10, title: 'Instance review', completed: 1 }
      ]
    }

    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/lessons/9' && init?.method === 'PUT') return jsonResponse({ ok: true })
      if (url === '/api/lessons' && init?.method === 'POST') return jsonResponse({ id: 11, title: 'Security groups' }, 201)
      return jsonResponse(moduleDetail)
    })

    const ModulePage = (await import('../pages/modules/[id]')).default
    render(<ModulePage />)

    expect(await screen.findByRole('heading', { name: 'EC2' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Marcar completada' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/lessons/9', expect.objectContaining({ method: 'PUT' }))
    })

    fireEvent.change(screen.getByPlaceholderText('Título de la lección'), { target: { value: 'Security groups' } })
    fireEvent.click(screen.getByRole('button', { name: 'Añadir lección' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/lessons', expect.objectContaining({ method: 'POST' }))
    })

    cleanup()
    vi.resetModules()
    setRouter('/modules/4', { id: '4' })
    mockAuth()
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}, 401))

    const ProtectedModulePage = (await import('../pages/modules/[id]')).default
    render(<ProtectedModulePage />)
    await waitFor(() => {
      expect(nextRouterMock.push).toHaveBeenCalledWith('/login?next=%2Fmodules%2F4')
    })
  })

  it('handles login success and invalid credentials', async () => {
    setRouter('/login', { next: '/admin/users' })
    const auth = mockAuth()
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ user: adminUser }))

    const LoginPage = (await import('../pages/login')).default
    render(<LoginPage />)

    fireEvent.change(screen.getByPlaceholderText('email@empresa.com'), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'valid-password-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => expect(auth.refresh).toHaveBeenCalled())
    expect(nextRouterMock.push).toHaveBeenCalledWith('/admin/users')

    cleanup()
    vi.resetModules()
    setRouter('/login')
    mockAuth()
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ error: 'invalid credentials' }, 401))

    const InvalidLoginPage = (await import('../pages/login')).default
    render(<InvalidLoginPage />)
    fireEvent.change(screen.getByPlaceholderText('email@empresa.com'), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Credenciales no válidas.')).toBeInTheDocument()

    cleanup()
    vi.resetModules()
    setRouter('/login')
    mockAuth()
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('network failed'))

    const FailedLoginPage = (await import('../pages/login')).default
    render(<FailedLoginPage />)
    fireEvent.change(screen.getByPlaceholderText('email@empresa.com'), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'valid-password-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText(/No se pudo conectar con el servidor/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).not.toBeDisabled()
  })

  it('runs setup states, validation errors and successful first-admin creation', async () => {
    setRouter('/setup')
    const auth = mockAuth()
    let setupAttempts = 0

    vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/auth/setup-status') {
        return jsonResponse({ needsSetup: true, requiresToken: true, productionRequiresToken: false })
      }
      if (url === '/api/auth/setup' && init?.method === 'POST') {
        setupAttempts += 1
        return setupAttempts === 1
          ? jsonResponse({ error: 'weak password' }, 400)
          : jsonResponse({ user: adminUser }, 201)
      }
      return jsonResponse({})
    })

    const SetupPage = (await import('../pages/setup')).default
    render(<SetupPage />)

    expect(await screen.findByPlaceholderText('AUTH_SETUP_TOKEN')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Email admin'), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Admin' } })
    fireEvent.change(screen.getByPlaceholderText('Contraseña de al menos 12 caracteres'), { target: { value: 'valid-password-123' } })
    fireEvent.change(screen.getByPlaceholderText('AUTH_SETUP_TOKEN'), { target: { value: 'token' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear admin' }))

    expect(await screen.findByText('weak password')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Crear admin' }))
    await waitFor(() => expect(auth.refresh).toHaveBeenCalled())
    expect(nextRouterMock.push).toHaveBeenCalledWith('/roadmaps')

    cleanup()
    vi.resetModules()
    setRouter('/setup')
    mockAuth()
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({
      needsSetup: false,
      requiresToken: false,
      productionRequiresToken: false
    }))

    const CompletedSetupPage = (await import('../pages/setup')).default
    render(<CompletedSetupPage />)
    expect(await screen.findByText(/Ya existe al menos un usuario/i)).toBeInTheDocument()
  })

  it('renders admin user states and performs create, activation and reset actions', async () => {
    setRouter('/admin/users')
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
        is_active: 0,
        can_view_all_roadmaps: 0,
        roadmap_access_ids: [1],
        created_at: '2026-05-30'
      }
    ]
    const roadmaps = [
      { id: 1, title: 'AWS Roadmap' },
      { id: 2, title: 'DevOps Roadmap' }
    ]

    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      if (init?.method === 'POST') return jsonResponse({ id: 3, email: 'new@example.com' }, 201)
      if (init?.method === 'PATCH') return jsonResponse({ ok: true })
      if (url === '/api/roadmaps') return jsonResponse(roadmaps)
      return jsonResponse(users)
    })

    const AdminUsersPage = (await import('../pages/admin/users')).default
    render(<AdminUsersPage />)

    expect(await screen.findByText('user@example.com')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('email@empresa.com'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'New User' } })
    fireEvent.change(screen.getByPlaceholderText('Contraseña de al menos 12 caracteres'), { target: { value: 'valid-password-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/users', expect.objectContaining({ method: 'POST' }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reactivar' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/users/2', expect.objectContaining({ method: 'PATCH' }))
    })

    expect(await screen.findByText('AWS Roadmap')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('DevOps Roadmap'))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/users/2', expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"set_roadmap_access"')
      }))
    })

    fireEvent.change(screen.getAllByPlaceholderText('Nueva contraseña')[1], { target: { value: 'reset-password-123' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Resetear' })[1])
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/users/2', expect.objectContaining({ method: 'PATCH' }))
    })
  })

  it('renders admin guards and audit log details', async () => {
    setRouter('/admin/users')
    mockAuth({ loading: true })
    const LoadingUsersPage = (await import('../pages/admin/users')).default
    render(<LoadingUsersPage />)
    expect(screen.getByText('Comprobando permisos...')).toBeInTheDocument()

    cleanup()
    vi.resetModules()
    setRouter('/admin/users')
    mockAuth()
    const UnauthorizedUsersPage = (await import('../pages/admin/users')).default
    render(<UnauthorizedUsersPage />)
    expect(screen.getByText('Necesitas una cuenta admin para gestionar usuarios.')).toBeInTheDocument()

    cleanup()
    vi.resetModules()
    setRouter('/admin/audit')
    mockAuth({ user: adminUser, isAdmin: true })
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse([
      {
        id: 1,
        actor_email: 'admin@example.com',
        action: 'user.create',
        entity_type: 'user',
        entity_id: '2',
        details: '{"email":"user@example.com"}',
        ip_address: '127.0.0.1',
        created_at: '2026-05-30T12:00:00.000Z'
      },
      {
        id: 2,
        actor_email: null,
        action: 'roadmap.seed',
        entity_type: 'roadmap',
        details: 'raw details',
        created_at: '2026-05-30T12:05:00.000Z'
      }
    ]))

    const AuditPage = (await import('../pages/admin/audit')).default
    render(<AuditPage />)

    expect(await screen.findByText('user.create')).toBeInTheDocument()
    expect(screen.getByText('admin@example.com · user #2')).toBeInTheDocument()
    expect(screen.getByText(/"email": "user@example.com"/)).toBeInTheDocument()
    expect(screen.getByText('sistema · roadmap')).toBeInTheDocument()
    expect(screen.getByText('raw details')).toBeInTheDocument()

    vi.resetModules()
    setRouter('/admin/audit')
    mockAuth()
    const UnauthorizedAuditPage = (await import('../pages/admin/audit')).default
    render(<UnauthorizedAuditPage />)
    expect(screen.getByText('Necesitas una cuenta admin para consultar auditoría.')).toBeInTheDocument()
  })
})
