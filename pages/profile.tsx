import React, { useCallback, useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Layout from '../components/Layout'
import { useAuth } from '../components/AuthProvider'
import { branding } from '../lib/branding'
import type { PortfolioResponse, UserRoadmapProgress } from '../lib/contracts'

function formatStudyTime(totalSeconds: number) {
  if (!totalSeconds) return '0 min'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (!hours) return `${Math.max(1, minutes)} min`
  if (!minutes) return `${hours} h`
  return `${hours} h ${minutes} min`
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export default function ProfilePage() {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router
  const { user, isAdmin, loading: authLoading } = useAuth()
  const [roadmaps, setRoadmaps] = useState<UserRoadmapProgress[]>([])
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [error, setError] = useState('')

  const loadStats = useCallback(async () => {
    setLoadingStats(true)
    setError('')
    try {
      const [progressRes, portfolioRes] = await Promise.all([
        fetch('/api/progress/roadmaps'),
        fetch('/api/portfolio')
      ])

      if (progressRes.status === 401 || portfolioRes.status === 401) {
        routerRef.current.push(`/login?next=${encodeURIComponent(routerRef.current.asPath)}`)
        return
      }

      if (!progressRes.ok || !portfolioRes.ok) {
        setError('No se pudo cargar todo tu resumen de actividad.')
        return
      }

      const [progressData, portfolioData] = await Promise.all([
        progressRes.json(),
        portfolioRes.json()
      ])
      setRoadmaps(Array.isArray(progressData) ? progressData : [])
      setPortfolio(portfolioData)
    } catch {
      setError('No se pudo conectar con el servidor para cargar tu actividad.')
    } finally {
      setLoadingStats(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      routerRef.current.push(`/login?next=${encodeURIComponent(routerRef.current.asPath)}`)
      return
    }
    void loadStats()
  }, [authLoading, user, loadStats])

  if (authLoading || !user) {
    return (
      <Layout>
        <Head>
          <title>{`Mi perfil | ${branding.productName}`}</title>
        </Head>
        <main className="container py-8 text-sm text-slate-600">Cargando perfil...</main>
      </Layout>
    )
  }

  const username = user.email.split('@')[0]
  const displayName = user.name?.trim() || username
  const roleLabel = isAdmin ? 'Administrador' : 'Alumno'

  const startedCount = roadmaps.length
  const completedCount = roadmaps.filter(roadmap => roadmap.status === 'completed').length
  const totalCompletedLessons = roadmaps.reduce((sum, roadmap) => sum + roadmap.completed_lessons_count, 0)
  const totalStudySeconds = roadmaps.reduce((sum, roadmap) => sum + roadmap.time_spent_seconds, 0)
  const roadmapsWithQuiz = roadmaps.filter(roadmap => (
    roadmap.quiz_attempts_count > 0 &&
    roadmap.average_quiz_percentage !== null &&
    roadmap.average_quiz_percentage !== undefined
  ))
  const totalQuizAttempts = roadmapsWithQuiz.reduce((sum, roadmap) => sum + roadmap.quiz_attempts_count, 0)
  const averageQuizPercentage = totalQuizAttempts > 0
    ? Math.round(roadmapsWithQuiz.reduce((sum, roadmap) => (
      sum + Number(roadmap.average_quiz_percentage) * roadmap.quiz_attempts_count
    ), 0) / totalQuizAttempts)
    : null

  return (
    <Layout>
      <Head>
        <title>{`Mi perfil | ${branding.productName}`}</title>
      </Head>

      <main>
        <section className="app-band">
          <div className="container flex flex-col gap-6 py-8 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Cuenta personal</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight text-slate-950">Mi perfil</h1>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                    isAdmin
                      ? 'border-sky-200 bg-sky-50 text-sky-800'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {roleLabel}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {displayName} · {user.email}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/my-roadmaps" className="secondary-action">
                Mi progreso
              </Link>
              <Link href="/portfolio" className="secondary-action">
                Mi Portfolio
              </Link>
              <Link href="/roadmaps" className="secondary-action">
                Explorar roadmaps
              </Link>
              {isAdmin && (
                <Link href="/admin" className="primary-action">
                  Panel Admin
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className="container grid gap-6 py-8">
          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="panel p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div
                aria-hidden="true"
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xl font-bold text-white"
              >
                {getInitials(displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-slate-950">Información de la cuenta</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Datos identificativos de tu usuario en {branding.productName}.
                </p>
              </div>
            </div>

            <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nombre</dt>
                <dd className="mt-1 text-sm font-medium text-slate-950">{user.name?.trim() || 'Sin nombre configurado'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Usuario</dt>
                <dd className="mt-1 text-sm font-medium text-slate-950">{username}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Correo electrónico</dt>
                <dd className="mt-1 break-all text-sm font-medium text-slate-950">{user.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rol</dt>
                <dd className="mt-1 text-sm font-medium text-slate-950">{roleLabel}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">ID de cuenta</dt>
                <dd className="mt-1 text-sm font-medium text-slate-950">#{user.id}</dd>
              </div>
            </dl>
          </div>

          <div className="panel p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Resumen de actividad</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Estado actual de tu aprendizaje y entregables registrados.
                </p>
              </div>
              {loadingStats && <span className="text-xs text-slate-500">Actualizando resumen...</span>}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <span className="block text-2xl font-bold text-slate-950">{startedCount}</span>
                <span className="text-sm text-slate-600">Roadmaps iniciados</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <span className="block text-2xl font-bold text-emerald-700">{completedCount}</span>
                <span className="text-sm text-slate-600">Roadmaps completados</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <span className="block text-2xl font-bold text-slate-950">{totalCompletedLessons}</span>
                <span className="text-sm text-slate-600">Lecciones completadas</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <span className="block text-2xl font-bold text-slate-950">{formatStudyTime(totalStudySeconds)}</span>
                <span className="text-sm text-slate-600">Tiempo de estudio</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <span className="block text-2xl font-bold text-sky-800">
                  {averageQuizPercentage === null ? 'Sin nota' : `${averageQuizPercentage}%`}
                </span>
                <span className="text-sm text-slate-600">Nota media en quizzes</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <span className="block text-2xl font-bold text-slate-950">
                  {portfolio ? `${portfolio.approved_evidences}/${portfolio.total_evidences}` : '0/0'}
                </span>
                <span className="text-sm text-slate-600">Evidencias aprobadas / totales</span>
              </div>
            </div>
          </div>

        </section>
      </main>
    </Layout>
  )
}
