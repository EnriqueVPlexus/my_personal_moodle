import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../components/AuthProvider'
import Header from '../components/Header'
import Layout from '../components/Layout'
import LessonCard from '../components/LessonCard'
import LessonForm from '../components/LessonForm'
import ModuleCard from '../components/ModuleCard'
import ModuleEvidencePanel, { ModuleEvidence } from '../components/ModuleEvidencePanel'
import ModuleForm from '../components/ModuleForm'
import ModuleLearningContent from '../components/ModuleLearningContent'
import ProgressBar from '../components/ProgressBar'
import RoadmapCard from '../components/RoadmapCard'
import RoadmapForm from '../components/RoadmapForm'

function mockFetch(response: unknown, ok = true) {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: vi.fn().mockResolvedValue(response)
  } as any)
}

describe('cards and layout components', () => {
  it('renders cards, progress and layout chrome', () => {
    mockFetch({ user: null })

    render(
      <AuthProvider>
        <Layout>
          <RoadmapCard title="AWS Roadmap" description="Cloud path" moduleCount={11} />
          <ModuleCard title="EC2" objective="Deploy compute" duration="1 semana" position={1} />
          <LessonCard title="SSH basics" />
          <ProgressBar value={125} />
        </Layout>
      </AuthProvider>
    )

    expect(screen.getByText('CanteraHub')).toBeInTheDocument()
    expect(screen.getByText('AWS Roadmap')).toBeInTheDocument()
    expect(screen.getByText('11 módulos')).toBeInTheDocument()
    expect(screen.getByText('Deploy compute')).toBeInTheDocument()
    expect(screen.getByText('SSH basics')).toBeInTheDocument()
  })

  it('renders learning module detail with external links and fallback text', () => {
    render(
      <ModuleLearningContent
        module={{
          title: 'EC2',
          objective: 'Aprender cómputo',
          contents: JSON.stringify(['AMI', 'Security Groups']),
          importance: 'Base de despliegue',
          official_resources: JSON.stringify([{ label: 'Amazon EC2', url: 'https://aws.amazon.com/ec2/' }]),
          support_videos: JSON.stringify([{ label: 'Curso AWS' }]),
          practical_activity: JSON.stringify(['Crear instancia']),
          deliverable_evidence: JSON.stringify(['Captura']),
          evaluation: 'Quiz'
        }}
      />
    )

    expect(screen.getByText('Aprender cómputo')).toBeInTheDocument()
    expect(screen.getByText('AMI')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Amazon EC2/i })).toHaveAttribute('href', 'https://aws.amazon.com/ec2/')
    expect(screen.getByText('Quiz')).toBeInTheDocument()
  })
})

describe('form components', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates roadmaps through the API', async () => {
    const onCreate = vi.fn()
    mockFetch({ id: 1, title: 'New roadmap' })

    render(<RoadmapForm onCreate={onCreate} />)
    fireEvent.change(screen.getByPlaceholderText('Título del roadmap'), { target: { value: 'New roadmap' } })
    fireEvent.change(screen.getByPlaceholderText('Descripción (opcional)'), { target: { value: 'Description' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear roadmap' }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ id: 1, title: 'New roadmap' }))
    expect(global.fetch).toHaveBeenCalledWith('/api/roadmaps', expect.objectContaining({ method: 'POST' }))
  })

  it('creates modules and lessons through the API', async () => {
    const onModuleCreate = vi.fn()
    const onLessonCreate = vi.fn()
    mockFetch({ id: 1 })

    const { rerender } = render(<ModuleForm roadmapId={1} onCreate={onModuleCreate} />)
    fireEvent.change(screen.getByPlaceholderText('Título del módulo'), { target: { value: 'IAM' } })
    fireEvent.click(screen.getByRole('button', { name: 'Añadir módulo' }))
    await waitFor(() => expect(onModuleCreate).toHaveBeenCalled())

    rerender(<LessonForm moduleId={1} onCreate={onLessonCreate} />)
    fireEvent.change(screen.getByPlaceholderText('Título de la lección'), { target: { value: 'Roles' } })
    fireEvent.click(screen.getByRole('button', { name: 'Añadir lección' }))
    await waitFor(() => expect(onLessonCreate).toHaveBeenCalled())
  })

  it('creates, edits and removes module evidence', async () => {
    const firstEvidence: ModuleEvidence = {
      id: 3,
      evidence_type: 'github',
      url: 'https://github.com/example/project',
      note: 'Pipeline funcional',
      created_at: '2026-07-20T10:00:00.000Z',
      updated_at: '2026-07-20T10:00:00.000Z'
    }
    const updatedEvidence: ModuleEvidence = {
      ...firstEvidence,
      evidence_type: 'demo',
      url: 'https://example.com/demo',
      updated_at: '2026-07-21T12:00:00.000Z'
    }
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ evidence: firstEvidence })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ evidence: updatedEvidence })
      } as any)
      .mockResolvedValueOnce({ ok: true, status: 204 } as any)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    function Harness() {
      const [evidence, setEvidence] = useState<ModuleEvidence | null>(null)
      return <ModuleEvidencePanel moduleId={7} evidence={evidence} onChange={setEvidence} />
    }

    render(<Harness />)
    expect(screen.getByText('Solo lectura')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar evidencia' })).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('https://github.com/usuario/proyecto'), {
      target: { value: firstEvidence.url }
    })
    fireEvent.change(screen.getByPlaceholderText(/Describe brevemente/i), {
      target: { value: firstEvidence.note }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar evidencia' }))

    expect(await screen.findByText('Con evidencia')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir evidencia' })).toHaveAttribute('href', firstEvidence.url)
    expect(screen.getByText('Pipeline funcional')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Editar evidencia' }))
    fireEvent.change(screen.getByLabelText('Tipo de evidencia'), { target: { value: 'demo' } })
    fireEvent.change(screen.getByLabelText('Enlace'), { target: { value: updatedEvidence.url } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Demo', { selector: 'span' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/evidences/modules/7', expect.objectContaining({
      method: 'PUT',
      body: expect.stringContaining('"evidence_type":"demo"')
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar evidencia' }))
    expect(await screen.findByText('Solo lectura')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenLastCalledWith('/api/evidences/modules/7', { method: 'DELETE' })
  })

  it('keeps the evidence form open and shows API errors', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'invalid url' })
    } as any)

    render(<ModuleEvidencePanel moduleId={7} evidence={null} onChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Nota'), { target: { value: 'Mi entrega' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar evidencia' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid url')
    expect(screen.getByRole('button', { name: 'Registrar evidencia' })).toBeInTheDocument()
  })
})

describe('auth provider and header', () => {
  it('shows admin navigation and logs out', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ user: { id: 1, email: 'admin@example.com', role: 'admin' } })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ ok: true })
      } as any)

    render(
      <AuthProvider>
        <Header />
      </AuthProvider>
    )

    expect(await screen.findByText(/admin@example.com/)).toBeInTheDocument()
    expect(screen.getByText('Mi progreso')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Usuarios')).toBeInTheDocument()
    expect(screen.getByText('Evidencias')).toBeInTheDocument()
    expect(screen.getByText('Importar JSON')).toBeInTheDocument()
    expect(screen.getByText('Auditoría')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' }))
  })

  it('exposes auth context refresh and logout', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ json: vi.fn().mockResolvedValue({ user: null }) } as any)
      .mockResolvedValueOnce({ json: vi.fn().mockResolvedValue({ user: { id: 2, email: 'user@example.com', role: 'user' } }) } as any)
      .mockResolvedValueOnce({ json: vi.fn().mockResolvedValue({ ok: true }) } as any)

    function Consumer() {
      const { user, refresh, logout } = useAuth()
      return (
        <div>
          <span>{user?.email || 'anonymous'}</span>
          <button onClick={refresh}>refresh</button>
          <button onClick={logout}>logout</button>
        </div>
      )
    }

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    )

    expect(await screen.findByText('anonymous')).toBeInTheDocument()
    fireEvent.click(screen.getByText('refresh'))
    expect(await screen.findByText('user@example.com')).toBeInTheDocument()
    fireEvent.click(screen.getByText('logout'))
    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument())
  })
})
