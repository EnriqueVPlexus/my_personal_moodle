import React, { useCallback, useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import LessonForm from '../../components/LessonForm'
import ModuleEvidencePanel, { ModuleEvidence } from '../../components/ModuleEvidencePanel'
import ModuleLearningContent from '../../components/ModuleLearningContent'
import { useAuth } from '../../components/AuthProvider'
import { LearningModule } from '../../lib/roadmapPresentation'
import { branding } from '../../lib/branding'

type ModuleProgress = {
  total_lessons: number
  completed_lessons_count: number
  progress_percentage: number
  status: 'not_started' | 'in_progress' | 'completed'
  next_lesson_title?: string | null
  time_spent_seconds: number
}

type QuizQuestion = {
  id: string
  prompt: string
  options: string[]
  explanation: string
}

type ModuleQuiz = {
  questions: QuizQuestion[]
}

type QuizSummary = {
  attempts_count: number
  average_score_percentage?: number | null
  best_score_percentage?: number | null
  latest_attempt?: {
    score: number
    max_score: number
    percentage: number
    submitted_at: string
  } | null
}

type QuizFeedbackItem = {
  question_id: string
  prompt: string
  selected_option?: string | null
  correct_option: string
  is_correct: boolean
  explanation: string
}

type QuizResult = {
  score: number
  max_score: number
  percentage: number
  passed: boolean
  feedback: QuizFeedbackItem[]
  summary?: QuizSummary
}

type ModuleDetail = LearningModule & {
  progress?: ModuleProgress | null
  quiz?: ModuleQuiz | null
  quiz_summary?: QuizSummary | null
}

type LessonWithProgress = {
  id: number
  title: string
  completed?: number | boolean
  progress_time_spent_seconds?: number
}

function formatStudyTime(totalSeconds: number) {
  if (!totalSeconds) return '0 min'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (!hours) return `${Math.max(1, minutes)} min`
  if (!minutes) return `${hours} h`
  return `${hours} h ${minutes} min`
}

function statusLabel(status: ModuleProgress['status']) {
  if (status === 'completed') return 'Completado'
  if (status === 'in_progress') return 'En curso'
  return 'No iniciado'
}

function formatQuizPercentage(value?: number | null) {
  return value === null || value === undefined ? 'Sin nota' : `${value}%`
}

function fallbackProgress(lessons: LessonWithProgress[]): ModuleProgress {
  const completedLessonsCount = lessons.filter(lesson => Number(lesson.completed) === 1).length
  const totalLessons = lessons.length
  const progressPercentage = totalLessons > 0
    ? Math.min(100, Math.round((completedLessonsCount / totalLessons) * 100))
    : 0
  const nextLesson = lessons.find(lesson => Number(lesson.completed) !== 1)
  const status = totalLessons > 0 && completedLessonsCount >= totalLessons
    ? 'completed'
    : completedLessonsCount > 0
      ? 'in_progress'
      : 'not_started'

  return {
    total_lessons: totalLessons,
    completed_lessons_count: completedLessonsCount,
    progress_percentage: progressPercentage,
    status,
    next_lesson_title: nextLesson?.title ?? null,
    time_spent_seconds: lessons.reduce((sum, lesson) => (
      sum + Number(lesson.progress_time_spent_seconds || 0)
    ), 0)
  }
}

export default function ModulePage() {
  const router = useRouter()
  const { id } = router.query
  const { isAdmin, user } = useAuth()
  const [module, setModule] = useState<ModuleDetail | null>(null)
  const [lessons, setLessons] = useState<LessonWithProgress[]>([])
  const [evidence, setEvidence] = useState<ModuleEvidence | null>(null)
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({})
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null)
  const [quizError, setQuizError] = useState('')
  const [quizSubmitting, setQuizSubmitting] = useState(false)
  const [progressError, setProgressError] = useState('')
  const [lessonUpdatingId, setLessonUpdatingId] = useState<number | null>(null)
  const [loadError, setLoadError] = useState('')
  const moduleOpenedAt = useRef(Date.now())

  const load = useCallback(async () => {
    if (!id) return
    setLoadError('')
    try {
      const res = await fetch(`/api/modules/${id}`)
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent(router.asPath)}`)
        return
      }
      if (!res.ok) {
        setLoadError(res.status === 404 ? 'El módulo ya no existe.' : 'No se pudo cargar el módulo.')
        return
      }
      const data = await res.json()
      setModule(data)
      setLessons(data.lessons || [])
      if (user) {
        const evidenceRes = await fetch(`/api/evidences/modules/${id}`)
        if (evidenceRes.ok) {
          const evidenceData = await evidenceRes.json()
          setEvidence(evidenceData.evidence || null)
        }
      } else {
        setEvidence(null)
      }
      setQuizAnswers({})
      setQuizResult(null)
      setQuizError('')
      setProgressError('')
      moduleOpenedAt.current = Date.now()
    } catch {
      setLoadError('No se pudo conectar con el servidor.')
    }
  }, [id, router, user])

  useEffect(() => { load() }, [load])

  async function toggleComplete(lesson: LessonWithProgress) {
    const elapsedSeconds = Math.max(30, Math.min(1800, Math.round((Date.now() - moduleOpenedAt.current) / 1000)))
    setLessonUpdatingId(lesson.id)
    setProgressError('')
    try {
      const res = await fetch(`/api/progress/lessons/${lesson.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completed: !lesson.completed,
          time_spent_seconds: lesson.completed ? 0 : elapsedSeconds
        })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setProgressError(data.error || 'No se pudo actualizar la lección.')
        return
      }
      await load()
    } catch {
      setProgressError('No se pudo conectar con el servidor.')
    } finally {
      setLessonUpdatingId(null)
    }
  }

  async function submitQuiz() {
    if (!module?.quiz) return
    setQuizSubmitting(true)
    setQuizError('')

    try {
      const res = await fetch(`/api/quizzes/modules/${module.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: quizAnswers })
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setQuizError(data.error || 'No se pudo guardar el intento.')
        return
      }

      const data = await res.json()
      setQuizResult(data)
      setModule(current => current ? { ...current, quiz_summary: data.summary } : current)
    } catch {
      setQuizError('No se pudo conectar con el servidor.')
    } finally {
      setQuizSubmitting(false)
    }
  }

  if (!module) return (
    <Layout>
      <main className="container py-8 text-sm text-slate-600">
        {loadError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
            <p>{loadError}</p>
            <button className="mt-3 font-semibold underline" onClick={() => load()}>Reintentar</button>
          </div>
        ) : 'Cargando...'}
      </main>
    </Layout>
  )

  const progress = user ? module.progress || fallbackProgress(lessons) : null
  const quiz = module.quiz
  const quizSummary = module.quiz_summary
  const quizComplete = Boolean(quiz?.questions.every(question => Number.isInteger(quizAnswers[question.id])))

  return (
    <Layout>
      <Head>
        <title>{`${module.title} | ${branding.productName}`}</title>
      </Head>

      <main>
        <section className="app-band">
          <div className="container grid gap-5 py-8 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Módulo {module.position ?? ''}</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{module.title}</h1>
              {module.objective && <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{module.objective}</p>}
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:w-[340px]">
              {module.duration && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                  <span className="block text-lg font-bold text-emerald-700">{module.duration}</span>
                  <span className="text-emerald-900">duración</span>
                </div>
              )}
              {progress && (
                <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
                  <span className="block text-lg font-bold text-sky-800">{progress.progress_percentage}%</span>
                  <span className="text-sky-950">progreso</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="container py-8">
          {progress && (
            <section className="panel mb-6 p-5">
              <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {statusLabel(progress.status)}
                    </span>
                    <span className="rounded-md bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                      {progress.completed_lessons_count}/{progress.total_lessons} lecciones
                    </span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-slate-950">Progreso del módulo</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {formatStudyTime(progress.time_spent_seconds)} acumulado en este módulo.
                  </p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-sky-600 transition-all"
                      style={{ width: `${progress.progress_percentage}%` }}
                    />
                  </div>
                </div>

                <div className="min-w-[220px] rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
                  <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Siguiente lección</span>
                  <span className="mt-1 block font-semibold text-slate-950">
                    {progress.next_lesson_title || 'Módulo completado'}
                  </span>
                </div>
              </div>
            </section>
          )}

          {module.objective && (
            <section>
              <ModuleLearningContent module={module} />
            </section>
          )}

        <section className="panel mt-6 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Lecciones</h2>
          <div className="mt-3 space-y-2">
            {progressError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{progressError}</p>
            )}
            {lessons.length > 0 ? (
              lessons.map(l => (
                <div key={l.id} className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <span className={`mb-1 inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
                      l.completed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {l.completed ? 'Completada' : 'Pendiente'}
                    </span>
                    <div className={`text-sm ${l.completed ? 'line-through text-slate-500' : 'text-slate-800'}`}>{l.title}</div>
                  </div>
                  {user && (
                    <div className="space-x-2">
                      <button
                        className="text-sm font-medium text-emerald-700 disabled:cursor-not-allowed disabled:text-slate-400"
                        disabled={lessonUpdatingId !== null}
                        onClick={() => toggleComplete(l)}
                      >
                        {lessonUpdatingId === l.id
                          ? 'Guardando...'
                          : l.completed ? 'Marcar como pendiente' : 'Marcar completada'}
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No hay lecciones todavía.</p>
            )}
          </div>

          {isAdmin ? (
            <div className="mt-4">
              <h3 className="font-semibold text-slate-950">Añadir lección</h3>
              <div className="mt-2">
                <LessonForm moduleId={Number(id)} onCreate={() => load()} />
              </div>
            </div>
          ) : user ? (
            <p className="mt-4 text-sm text-slate-500">Tu progreso se guarda por usuario cuando marques lecciones.</p>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Inicia sesión para guardar tu progreso en las lecciones.</p>
          )}
        </section>

        {user ? (
          <ModuleEvidencePanel
            moduleId={Number(module.id)}
            evidence={evidence}
            onChange={setEvidence}
          />
        ) : (
          <section className="panel mt-6 p-5">
            <h2 className="text-lg font-semibold text-slate-950">Evidencia y portfolio</h2>
            <p className="mt-2 text-sm text-slate-600">
              Inicia sesión para registrar el entregable de este módulo.
            </p>
          </section>
        )}

        {quiz && quiz.questions.length > 0 && (
          <section className="panel mt-6 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Evaluación</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">Quiz del módulo</h2>
              </div>
              {user && (
                <div className="grid gap-3 text-sm sm:grid-cols-3 lg:w-[520px]">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Intentos</span>
                    <span className="mt-1 block text-xl font-bold text-slate-950">{quizSummary?.attempts_count || 0}</span>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Mejor</span>
                    <span className="mt-1 block text-xl font-bold text-slate-950">{formatQuizPercentage(quizSummary?.best_score_percentage)}</span>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Media</span>
                    <span className="mt-1 block text-xl font-bold text-slate-950">{formatQuizPercentage(quizSummary?.average_score_percentage)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 space-y-4">
              {quiz.questions.map((question, questionIndex) => (
                <fieldset key={question.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <legend className="px-1 text-sm font-semibold text-slate-950">
                    {questionIndex + 1}. {question.prompt}
                  </legend>
                  <div className="mt-3 grid gap-2">
                    {question.options.map((option, optionIndex) => (
                      <label key={option} className="flex items-start gap-3 rounded-md bg-white p-3 text-sm text-slate-700 shadow-sm">
                        <input
                          type="radio"
                          name={`quiz-${question.id}`}
                          checked={quizAnswers[question.id] === optionIndex}
                          disabled={!user || quizSubmitting}
                          onChange={() => setQuizAnswers(current => ({ ...current, [question.id]: optionIndex }))}
                          className="mt-1"
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>

            {quizError && (
              <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{quizError}</p>
            )}

            {quizResult && (
              <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-2xl font-bold text-emerald-700">{quizResult.percentage}%</span>
                  <span className="text-sm font-semibold text-emerald-900">
                    {quizResult.score}/{quizResult.max_score} respuestas correctas
                  </span>
                  <span className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {quizResult.passed ? 'Superado' : 'A reforzar'}
                  </span>
                </div>
                <div className="mt-4 grid gap-2">
                  {quizResult.feedback.map(item => (
                    <div key={item.question_id} className="rounded-md bg-white p-3 text-sm text-slate-700">
                      <div className="font-semibold text-slate-950">{item.prompt}</div>
                      <div className="mt-1">
                        {item.is_correct ? 'Correcta' : `Correcta: ${item.correct_option}`}
                      </div>
                      <div className="mt-1 text-slate-600">{item.explanation}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5">
              {user ? (
                <button
                  onClick={submitQuiz}
                  disabled={quizSubmitting || !quizComplete}
                  className="rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {quizSubmitting ? 'Guardando...' : quizComplete ? 'Enviar quiz' : 'Responde todas las preguntas'}
                </button>
              ) : (
                <p className="text-sm text-slate-500">Inicia sesión para guardar intentos y notas de quiz.</p>
              )}
            </div>
          </section>
        )}
        </div>
      </main>
    </Layout>
  )
}
