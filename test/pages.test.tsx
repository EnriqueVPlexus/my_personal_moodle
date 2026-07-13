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
      duration: '6 meses (5-8 h/semana)',
      description: 'Cloud path',
      objectives: '["Launch AWS"]',
      methodology: ['Practicar con evidencias'],
      evaluation_weights: '{"Quiz":"20%","Laboratorio":"80%"}',
      progress: {
        completed_lessons_count: 1,
        total_lessons: 3,
        total_modules: 2,
        time_spent_seconds: 3900,
        progress_percentage: 33,
        status: 'in_progress',
        next_href: '/modules/10',
        next_step_label: 'Continuar con Instance review'
      },
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
          evaluation: 'Revisión práctica',
          progress: {
            total_lessons: 2,
            completed_lessons_count: 1,
            progress_percentage: 50,
            status: 'in_progress',
            next_lesson_title: 'Instance review'
          }
        },
        {
          id: 11,
          position: 2,
          title: 'IAM',
          duration: '1 semana',
          objective: 'Gestionar accesos',
          progress: {
            total_lessons: 1,
            completed_lessons_count: 0,
            progress_percentage: 0,
            status: 'not_started',
            next_lesson_title: 'Policies'
          }
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
    expect(screen.getByText('6 meses (5-8 h/semana)')).toBeInTheDocument()
    expect(screen.getByText('Launch AWS')).toBeInTheDocument()
    expect(screen.getByText('Tu progreso en este roadmap')).toBeInTheDocument()
    expect(screen.getByText('Continuar con Instance review')).toBeInTheDocument()
    expect(screen.getByText((_content, element) => (
      element?.tagName.toLowerCase() === 'p' &&
      Boolean(element.textContent?.includes('1/3 lecciones completadas'))
    ))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Amazon EC2/i })).toHaveAttribute('href', 'https://aws.amazon.com/ec2/')
    expect(screen.getByText('Ocultar detalle')).toBeInTheDocument()
    expect(screen.getByText('Ver detalle')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('heading', { name: 'IAM' }))
    expect(screen.getAllByText('Ocultar detalle')).toHaveLength(2)

    fireEvent.click(screen.getByRole('heading', { name: 'EC2' }))
    expect(screen.getAllByText('Ver detalle')).toHaveLength(1)

    fireEvent.change(screen.getByPlaceholderText('Título del módulo'), { target: { value: 'S3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Añadir módulo' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/modules', expect.objectContaining({ method: 'POST' }))
    })
  })

  it('renders module details, redirects protected reads and updates personal lesson progress', async () => {
    setRouter('/modules/4', { id: '4' })
    mockAuth({ user: adminUser, isAdmin: true })

    const moduleDetail = {
      id: 4,
      title: 'EC2',
      position: 1,
      duration: '1 semana',
      objective: 'Compute foundations',
      contents: '[]',
      progress: {
        total_lessons: 2,
        completed_lessons_count: 1,
        progress_percentage: 50,
        status: 'in_progress',
        next_lesson_title: 'SSH basics',
        time_spent_seconds: 900
      },
      quiz: {
        questions: [
          {
            id: 'module-content',
            prompt: 'Que tema aparece en EC2?',
            options: ['AMI', 'S3'],
            explanation: 'Sale del contenido.'
          }
        ]
      },
      quiz_summary: {
        attempts_count: 1,
        best_score_percentage: 50,
        average_score_percentage: 50
      },
      lessons: [
        { id: 9, title: 'SSH basics', completed: 0, progress_time_spent_seconds: 0 },
        { id: 10, title: 'Instance review', completed: 1, progress_time_spent_seconds: 900 }
      ]
    }

    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/progress/lessons/9' && init?.method === 'PUT') return jsonResponse({ ok: true })
      if (url === '/api/quizzes/modules/4' && init?.method === 'POST') {
        return jsonResponse({
          score: 1,
          max_score: 1,
          percentage: 100,
          passed: true,
          feedback: [
            {
              question_id: 'module-content',
              prompt: 'Que tema aparece en EC2?',
              selected_option: 'AMI',
              correct_option: 'AMI',
              is_correct: true,
              explanation: 'Sale del contenido.'
            }
          ],
          summary: {
            attempts_count: 2,
            best_score_percentage: 100,
            average_score_percentage: 75
          }
        }, 201)
      }
      if (url === '/api/lessons' && init?.method === 'POST') return jsonResponse({ id: 11, title: 'Security groups' }, 201)
      return jsonResponse(moduleDetail)
    })

    const ModulePage = (await import('../pages/modules/[id]')).default
    render(<ModulePage />)

    expect(await screen.findByRole('heading', { name: 'EC2' })).toBeInTheDocument()
    expect(screen.getByText('Progreso del módulo')).toBeInTheDocument()
    expect(screen.getByText('1/2 lecciones')).toBeInTheDocument()
    expect(screen.getByText('15 min acumulado en este módulo.')).toBeInTheDocument()
    expect(screen.getByText('Quiz del módulo')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('AMI'))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar quiz' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/quizzes/modules/4', expect.objectContaining({ method: 'POST' }))
    })
    expect(await screen.findByText('1/1 respuestas correctas')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Marcar completada' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/progress/lessons/9', expect.objectContaining({ method: 'PUT' }))
    })

    fireEvent.change(screen.getByPlaceholderText('Título de la lección'), { target: { value: 'Security groups' } })
    fireEvent.click(screen.getByRole('button', { name: 'Añadir lección' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/lessons', expect.objectContaining({ method: 'POST' }))
    })

    cleanup()
    vi.resetModules()
    setRouter('/modules/5', { id: '5' })
    mockAuth({ user: { id: 2, email: 'user@example.com', role: 'user' } })
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({
      id: 5,
      title: 'IAM',
      position: 2,
      duration: '2 semanas',
      objective: 'Access foundations',
      contents: '[]',
      lessons: [
        { id: 12, title: 'Policies', completed: 1, progress_time_spent_seconds: 3600 }
      ]
    }))

    const CompletedModulePage = (await import('../pages/modules/[id]')).default
    render(<CompletedModulePage />)

    expect(await screen.findByRole('heading', { name: 'IAM' })).toBeInTheDocument()
    expect(screen.getByText('Módulo completado')).toBeInTheDocument()
    expect(screen.getByText('1 h acumulado en este módulo.')).toBeInTheDocument()

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
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ user: adminUser }))

    const DefaultLoginPage = (await import('../pages/login')).default
    render(<DefaultLoginPage />)
    fireEvent.change(screen.getByPlaceholderText('email@empresa.com'), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'valid-password-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => {
      expect(nextRouterMock.push).toHaveBeenCalledWith('/my-roadmaps')
    })

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

  it('renders personal roadmap dashboard and redirects anonymous users', async () => {
    setRouter('/my-roadmaps')
    mockAuth({ user: adminUser, isAdmin: true })

    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url === '/api/progress/roadmaps') {
        return jsonResponse([
          {
            roadmap_id: 7,
            title: 'IA para DevOps',
            description: 'Ruta aplicada',
            duration: '8 semanas',
            last_activity_at: '2026-07-06T08:30:00.000Z',
            completed_lessons_count: 3,
            total_lessons: 8,
            total_modules: 5,
            time_spent_seconds: 4500,
            progress_percentage: 38,
            status: 'in_progress',
            next_href: '/modules/15',
            next_step_label: 'Continuar con Evaluacion de prompts',
            current_module_title: 'Observabilidad',
            quiz_attempts_count: 1,
            average_quiz_percentage: 70,
            best_quiz_percentage: 80,
            last_quiz_percentage: 70
          },
          {
            roadmap_id: 8,
            title: 'AWS',
            description: 'Cloud path',
            duration: '6 meses',
            last_activity_at: '2026-07-07T10:00:00.000Z',
            completed_lessons_count: 4,
            total_lessons: 4,
            total_modules: 2,
            time_spent_seconds: 7200,
            progress_percentage: 100,
            status: 'completed',
            next_href: '/modules/20',
            next_step_label: 'Volver al roadmap',
            current_module_title: 'EC2',
            quiz_attempts_count: 2,
            average_quiz_percentage: 90,
            best_quiz_percentage: 100,
            last_quiz_percentage: 90
          },
          {
            roadmap_id: 9,
            title: 'Kubernetes',
            description: 'Cluster path',
            duration: '4 semanas',
            last_activity_at: '2026-07-01T10:00:00.000Z',
            completed_lessons_count: 1,
            total_lessons: 5,
            total_modules: 2,
            time_spent_seconds: 0,
            progress_percentage: 20,
            status: 'paused',
            next_href: '/modules/30',
            next_step_label: 'Continuar con Pods',
            current_module_title: 'Pods',
            quiz_attempts_count: 0
          }
        ])
      }
      return jsonResponse({})
    })

    const MyRoadmapsPage = (await import('../pages/my-roadmaps')).default
    render(<MyRoadmapsPage />)

    expect(await screen.findByRole('heading', { name: 'Mis roadmaps' })).toBeInTheDocument()
    expect(screen.getByText('IA para DevOps')).toBeInTheDocument()
    expect(screen.getByText('AWS')).toBeInTheDocument()
    expect(screen.getByText('Kubernetes')).toBeInTheDocument()
    expect(screen.getByText('pausados')).toBeInTheDocument()
    expect(screen.getByText('media quiz')).toBeInTheDocument()
    expect(screen.getByText('83%')).toBeInTheDocument()
    expect(screen.getByText('3 h 15 min')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/progress/roadmaps')

    cleanup()
    vi.resetModules()
    setRouter('/my-roadmaps')
    mockAuth()
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}, 401))

    const ProtectedMyRoadmapsPage = (await import('../pages/my-roadmaps')).default
    render(<ProtectedMyRoadmapsPage />)

    await waitFor(() => {
      expect(nextRouterMock.push).toHaveBeenCalledWith('/login?next=%2Fmy-roadmaps')
    })
  })

  it('shows an empty state when the user has no started roadmaps', async () => {
    setRouter('/my-roadmaps')
    mockAuth({ user: adminUser })
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse([]))

    const MyRoadmapsPage = (await import('../pages/my-roadmaps')).default
    render(<MyRoadmapsPage />)

    expect(await screen.findByText('Aún no has empezado ningún roadmap')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explorar roadmaps' })).toHaveAttribute('href', '/roadmaps')
  })

  it('shows progress loading errors and allows retrying', async () => {
    setRouter('/my-roadmaps')
    mockAuth({ user: adminUser })
    let attempts = 0
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      attempts += 1
      return attempts === 1
        ? jsonResponse({ error: 'temporary failure' }, 500)
        : jsonResponse([])
    })

    const MyRoadmapsPage = (await import('../pages/my-roadmaps')).default
    render(<MyRoadmapsPage />)

    expect(await screen.findByText('No se pudo cargar tu progreso.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Aún no has empezado ningún roadmap')).toBeInTheDocument()
    expect(attempts).toBe(2)
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
      { id: 1, email: 'admin@example.com', name: 'Admin', role: 'admin', is_active: 1, created_at: '2026-05-30' },
      { id: 2, email: 'user@example.com', name: null, role: 'user', is_active: 0, created_at: '2026-05-30' }
    ]

    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      if (init?.method === 'POST') return jsonResponse({ id: 3, email: 'new@example.com' }, 201)
      if (init?.method === 'PATCH') return jsonResponse({ ok: true })
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
