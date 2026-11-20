import React, { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { useAuth } from '../../components/AuthProvider'
import { branding } from '../../lib/branding'
import type { AuditLogEntryContract } from '../../lib/contracts'

type AuditRow = AuditLogEntryContract

const SYSTEM_ACTOR_KEY = '__system__'

const ENTITY_LABELS: Record<string, string> = {
  user: 'Usuarios',
  roadmap: 'Roadmaps',
  module: 'Módulos',
  lesson: 'Lecciones',
  evidence: 'Evidencias'
}

const ACTION_LABELS: Record<string, string> = {
  'auth.setup_admin': 'Setup admin inicial',
  'user.create': 'Usuario creado',
  'user.activate': 'Usuario reactivado',
  'user.deactivate': 'Usuario desactivado',
  'user.reset_password': 'Contraseña reseteada',
  'user.update_roadmap_access': 'Acceso a roadmaps actualizado',
  'roadmap.create': 'Roadmap creado',
  'roadmap.update': 'Roadmap editado',
  'roadmap.delete': 'Roadmap eliminado',
  'roadmap.import_create': 'Roadmap importado (nuevo)',
  'roadmap.import_update': 'Roadmap importado (actualizado)',
  'module.create': 'Módulo creado',
  'module.update': 'Módulo editado',
  'module.delete': 'Módulo eliminado',
  'lesson.create': 'Lección creada',
  'lesson.update': 'Lección editada',
  'lesson.delete': 'Lección eliminada',
  'evidence.review': 'Evidencia revisada'
}

function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function entityLabel(entityType: string) {
  return ENTITY_LABELS[entityType] || (entityType ? entityType.charAt(0).toUpperCase() + entityType.slice(1) : 'Otro')
}

function actionLabel(action: string) {
  return ACTION_LABELS[action] || action.replace(/[._]/g, ' ')
}

function parseDetails(details?: string | null) {
  if (!details) return ''
  try {
    return JSON.stringify(JSON.parse(details), null, 2)
  } catch {
    return details
  }
}

export default function AuditPage() {
  const { isAdmin, loading } = useAuth()
  const [logs, setLogs] = useState<AuditRow[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [entityFilter, setEntityFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [actorFilter, setActorFilter] = useState('all')

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/audit-logs')
      .then(res => res.ok ? res.json() : [])
      .then(setLogs)
  }, [isAdmin])

  const entityOptions = useMemo(
    () => Array.from(new Set(logs.map(log => log.entity_type).filter(Boolean))).sort(),
    [logs]
  )

  const actionOptions = useMemo(
    () => Array.from(new Set(logs.map(log => log.action).filter(Boolean))).sort(),
    [logs]
  )

  const actorOptions = useMemo(
    () => Array.from(new Set(logs.map(log => log.actor_email || SYSTEM_ACTOR_KEY))).sort(),
    [logs]
  )

  const hasActiveFilters = Boolean(
    searchQuery.trim() || entityFilter !== 'all' || actionFilter !== 'all' || actorFilter !== 'all'
  )

  const filteredLogs = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchQuery)
    return logs.filter(log => {
      if (entityFilter !== 'all' && log.entity_type !== entityFilter) return false
      if (actionFilter !== 'all' && log.action !== actionFilter) return false
      if (actorFilter !== 'all') {
        const logActorKey = log.actor_email || SYSTEM_ACTOR_KEY
        if (logActorKey !== actorFilter) return false
      }
      if (normalizedQuery) {
        const haystack = [
          log.actor_email || 'sistema',
          log.action,
          actionLabel(log.action),
          log.entity_type,
          entityLabel(log.entity_type),
          log.entity_id ?? '',
          log.details ?? '',
          log.ip_address ?? ''
        ].join(' ')
        if (!normalizeSearchText(haystack).includes(normalizedQuery)) return false
      }
      return true
    })
  }, [logs, searchQuery, entityFilter, actionFilter, actorFilter])

  function clearFilters() {
    setSearchQuery('')
    setEntityFilter('all')
    setActionFilter('all')
    setActorFilter('all')
  }

  if (loading) {
    return (
      <Layout>
        <main className="container py-8 text-sm text-slate-600">Comprobando permisos...</main>
      </Layout>
    )
  }

  if (!isAdmin) {
    return (
      <Layout>
        <main className="container py-8">
          <section className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
            <h1 className="text-xl font-bold">No autorizado</h1>
            <p className="mt-2 text-sm">Necesitas una cuenta admin para consultar auditoría.</p>
            <Link href="/login" className="mt-4 inline-flex rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white">Entrar</Link>
          </section>
        </main>
      </Layout>
    )
  }

  return (
    <Layout>
      <Head>
        <title>{`Auditoría | ${branding.productName}`}</title>
      </Head>

      <main>
        <section className="app-band">
          <div className="container py-8">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Admin</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Auditoría</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Últimas acciones sensibles realizadas por usuarios admin.
            </p>
          </div>
        </section>

        <section className="container grid gap-3 py-8">
          <div className="panel grid gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-600">
                {hasActiveFilters
                  ? `Mostrando ${filteredLogs.length} de ${logs.length} ${logs.length === 1 ? 'evento' : 'eventos'}`
                  : `${logs.length} ${logs.length === 1 ? 'evento' : 'eventos'}`}
              </span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm font-semibold text-sky-700 hover:text-sky-900"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
            <input
              type="search"
              aria-label="Buscar en auditoría"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por actor, acción, entidad, ID o detalles..."
              className="form-field"
            />
            <div className="grid gap-2 sm:grid-cols-3">
              <select
                aria-label="Filtrar por entidad"
                value={entityFilter}
                onChange={e => setEntityFilter(e.target.value)}
                className="form-field"
              >
                <option value="all">Todas las entidades</option>
                {entityOptions.map(option => (
                  <option key={option} value={option}>{entityLabel(option)}</option>
                ))}
              </select>
              <select
                aria-label="Filtrar por acción"
                value={actionFilter}
                onChange={e => setActionFilter(e.target.value)}
                className="form-field"
              >
                <option value="all">Todas las acciones</option>
                {actionOptions.map(option => (
                  <option key={option} value={option}>{actionLabel(option)}</option>
                ))}
              </select>
              <select
                aria-label="Filtrar por actor"
                value={actorFilter}
                onChange={e => setActorFilter(e.target.value)}
                className="form-field"
              >
                <option value="all">Todos los actores</option>
                {actorOptions.map(option => (
                  <option key={option} value={option}>{option === SYSTEM_ACTOR_KEY ? 'Sistema' : option}</option>
                ))}
              </select>
            </div>
          </div>

          {logs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
              Todavía no hay eventos de auditoría.
            </p>
          ) : filteredLogs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
              No hay eventos que coincidan con los filtros actuales.
            </p>
          ) : (
            filteredLogs.map(log => (
              <article key={log.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-950">{log.action}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {log.actor_email || 'sistema'} · {log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ''}
                    </p>
                  </div>
                  <div className="text-sm text-slate-500 md:text-right">
                    <p>{new Date(log.created_at).toLocaleString()}</p>
                    {log.ip_address && <p>{log.ip_address}</p>}
                  </div>
                </div>
                {log.details && (
                  <pre className="mt-3 overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">
                    {parseDetails(log.details)}
                  </pre>
                )}
              </article>
            ))
          )}
        </section>
      </main>
    </Layout>
  )
}
