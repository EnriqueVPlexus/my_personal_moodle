import React, { ChangeEvent, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { useAuth } from '../../components/AuthProvider'
import { branding } from '../../lib/branding'
import type { NormalizedRoadmapImport, RoadmapImportIssue } from '../../lib/roadmapImport'

const exampleRoadmap = {
  title: 'Roadmap de ejemplo',
  description: 'Ruta importada manualmente desde JSON.',
  duration: '2 semanas',
  category: 'Desarrollo',
  topics: ['TypeScript', 'Testing'],
  objectives: ['Construir una entrega verificable'],
  methodology: ['Práctica guiada'],
  evaluation_weights: { Práctica: '100%' },
  modules: [{
    position: 0,
    title: 'Fundamentos',
    level: 'beginner',
    duration: '2 semanas',
    objective: 'Dominar los fundamentos.',
    contents: ['Conceptos básicos'],
    official_resources: [{ label: 'Documentación oficial', url: 'https://www.typescriptlang.org/docs/' }],
    practical_activity: ['Crear un proyecto pequeño'],
    deliverable_evidence: ['Enlace al repositorio'],
    evaluation: 'Revisión del entregable.'
  }]
}

type Preview = { roadmap: NormalizedRoadmapImport; existing: { id: number; title: string } | null }

export default function ImportRoadmapPage() {
  const { isAdmin, loading } = useAuth()
  const [jsonText, setJsonText] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [issues, setIssues] = useState<RoadmapImportIssue[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resultId, setResultId] = useState<number | null>(null)

  function resetResult() {
    setPreview(null)
    setIssues([])
    setError('')
    setResultId(null)
  }

  function changeText(value: string) {
    setJsonText(value)
    resetResult()
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 1024 * 1024) {
      setError('El archivo no puede superar 1 MB.')
      return
    }
    changeText(await file.text())
  }

  function parseInput() {
    try {
      return { value: JSON.parse(jsonText) as unknown }
    } catch (parseError) {
      const detail = parseError instanceof Error ? parseError.message : 'JSON no válido'
      setError(`No se puede leer el JSON: ${detail}`)
      return null
    }
  }

  async function requestPreview() {
    resetResult()
    const parsed = parseInput()
    if (!parsed) return
    setBusy(true)
    try {
      const res = await fetch('/api/roadmaps/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', roadmap: parsed.value })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'No se pudo validar el roadmap.')
        setIssues(data.issues || [])
        return
      }
      setPreview(data)
    } catch {
      setError('No se pudo conectar con el servidor para validar el roadmap.')
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    const parsed = parseInput()
    if (!parsed || !preview) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/roadmaps/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'publish',
          strategy: preview.existing ? 'update' : 'create',
          roadmap: parsed.value
        })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'No se pudo publicar el roadmap.')
        return
      }
      setResultId(data.roadmap_id)
    } catch {
      setError('No se pudo conectar con el servidor para publicar el roadmap.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Layout><main className="container py-8 text-sm text-slate-600">Comprobando permisos...</main></Layout>
  if (!isAdmin) return (
    <Layout>
      <main className="container py-8">
        <section className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
          <h1 className="text-xl font-bold">No autorizado</h1>
          <p className="mt-2 text-sm">Necesitas una cuenta admin para importar roadmaps.</p>
          <Link href="/login" className="mt-4 inline-flex rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white">Entrar</Link>
        </section>
      </main>
    </Layout>
  )

  return (
    <Layout>
      <Head><title>{`Importar roadmap | ${branding.productName}`}</title></Head>
      <main>
        <section className="app-band">
          <div className="container py-8">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Admin</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Importar roadmap JSON</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Valida y revisa el contenido antes de publicarlo. Una actualización conserva módulos no incluidos y sus progresos.
            </p>
          </div>
        </section>

        <section className="container grid gap-6 py-8 lg:grid-cols-[1fr_0.9fr]">
          <div className="panel p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="grid gap-1 text-sm font-semibold text-slate-900">
                Seleccionar archivo JSON
                <input type="file" accept="application/json,.json" onChange={handleFile} className="text-sm font-normal text-slate-600" />
              </label>
              <button type="button" onClick={() => changeText(JSON.stringify(exampleRoadmap, null, 2))} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cargar ejemplo
              </button>
            </div>
            <label htmlFor="roadmap-json" className="mt-5 block text-sm font-semibold text-slate-900">Contenido JSON</label>
            <textarea
              id="roadmap-json"
              value={jsonText}
              onChange={event => changeText(event.target.value)}
              spellCheck={false}
              placeholder="Pega aquí el objeto JSON del roadmap"
              className="mt-2 min-h-[480px] w-full rounded-md border border-slate-300 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
            <button type="button" disabled={busy || !jsonText.trim()} onClick={requestPreview} className="primary-action mt-4">
              {busy ? 'Validando...' : 'Validar y previsualizar'}
            </button>
          </div>

          <div className="grid content-start gap-4" aria-live="polite">
            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
            {issues.length > 0 && (
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h2 className="font-semibold text-amber-950">Errores que debes corregir</h2>
                <ul className="mt-3 grid gap-2 text-sm text-amber-900">
                  {issues.map((issue, index) => <li key={`${issue.path}-${index}`}><code>{issue.path}</code>: {issue.message}</li>)}
                </ul>
              </section>
            )}
            {preview && (
              <section className="panel p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Vista previa válida</p>
                <h2 className="mt-2 text-xl font-bold text-slate-950">{preview.roadmap.title}</h2>
                <p className="mt-2 text-sm text-slate-600">{preview.roadmap.description || 'Sin descripción'}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-slate-500">Categoría</dt><dd className="font-semibold text-slate-900">{preview.roadmap.category || 'Sin clasificar'}</dd></div>
                  <div><dt className="text-slate-500">Módulos</dt><dd className="font-semibold text-slate-900">{preview.roadmap.modules.length}</dd></div>
                  <div><dt className="text-slate-500">Duración</dt><dd className="font-semibold text-slate-900">{preview.roadmap.duration || 'Por definir'}</dd></div>
                  <div><dt className="text-slate-500">Temas</dt><dd className="font-semibold text-slate-900">{preview.roadmap.topics.join(', ') || 'Sin temas'}</dd></div>
                </dl>
                <ol className="mt-5 grid gap-2">
                  {preview.roadmap.modules.map(module => (
                    <li key={`${module.position}-${module.title}`} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <span className="font-semibold">{module.position + 1}. {module.title}</span>
                      {module.duration && <span className="ml-2 text-slate-500">· {module.duration}</span>}
                    </li>
                  ))}
                </ol>
                <div className={`mt-5 rounded-md p-3 text-sm ${preview.existing ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>
                  {preview.existing
                    ? 'Ya existe un roadmap con este título. Se actualizarán sus datos y módulos coincidentes sin eliminar contenido.'
                    : 'El título es nuevo. Se creará un roadmap.'}
                </div>
                <button type="button" disabled={busy || Boolean(resultId)} onClick={publish} className="primary-action mt-4">
                  {busy ? 'Publicando...' : preview.existing ? 'Actualizar roadmap' : 'Publicar roadmap'}
                </button>
              </section>
            )}
            {resultId && (
              <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
                <h2 className="font-semibold">Roadmap importado correctamente</h2>
                <Link href={`/roadmaps/${resultId}`} className="mt-3 inline-flex rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Abrir roadmap</Link>
              </section>
            )}
          </div>
        </section>
      </main>
    </Layout>
  )
}
