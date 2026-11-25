import React, { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { useAuth } from '../../components/AuthProvider'
import { branding } from '../../lib/branding'
import type { AdminUserWithAccess, CatalogRoadmap } from '../../lib/contracts'

type UserRow = AdminUserWithAccess
type RoadmapRow = Pick<CatalogRoadmap, 'id' | 'title'>

function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}


export default function AdminUsersPage() {
  const { user, isAdmin, loading } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [roadmaps, setRoadmaps] = useState<RoadmapRow[]>([])
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [expandedUserIds, setExpandedUserIds] = useState<Record<number, boolean>>({})
  const [resetPasswords, setResetPasswords] = useState<Record<number, string>>({})
  const [resetFeedback, setResetFeedback] = useState<Record<number, { type: 'error' | 'success'; message: string } | undefined>>({})
  const [accessSaving, setAccessSaving] = useState<Record<number, boolean>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [accessFilter, setAccessFilter] = useState<'all' | 'all_roadmaps' | 'restricted'>('all')

  const hasActiveFilters = Boolean(
    searchQuery.trim() || roleFilter !== 'all' || statusFilter !== 'all' || accessFilter !== 'all'
  )

  const filteredUsers = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchQuery)
    return users.filter(account => {
      if (normalizedQuery) {
        const matchesEmail = normalizeSearchText(account.email).includes(normalizedQuery)
        const matchesName = normalizeSearchText(account.name || '').includes(normalizedQuery)
        if (!matchesEmail && !matchesName) return false
      }
      if (roleFilter !== 'all' && account.role !== roleFilter) return false
      if (statusFilter === 'active' && !account.is_active) return false
      if (statusFilter === 'inactive' && Boolean(account.is_active)) return false
      if (accessFilter === 'all_roadmaps') {
        const hasAll = account.role === 'admin' || Number(account.can_view_all_roadmaps) !== 0
        if (!hasAll) return false
      }
      if (accessFilter === 'restricted') {
        const isRestricted = account.role !== 'admin' && Number(account.can_view_all_roadmaps) === 0
        if (!isRestricted) return false
      }
      return true
    })
  }, [users, searchQuery, roleFilter, statusFilter, accessFilter])

  function clearFilters() {
    setSearchQuery('')
    setRoleFilter('all')
    setStatusFilter('all')
    setAccessFilter('all')
  }

  function toggleUserExpanded(userId: number) {
    setExpandedUserIds(current => ({ ...current, [userId]: !current[userId] }))
  }

  async function loadUsers() {
    const res = await fetch('/api/users')
    if (res.ok) setUsers(await res.json())
  }

  async function loadRoadmaps() {
    const res = await fetch('/api/roadmaps')
    if (res.ok) setRoadmaps(await res.json())
  }

  useEffect(() => {
    if (isAdmin) {
      loadUsers()
      loadRoadmaps()
    }
  }, [isAdmin])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, role, password })
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error || 'No se pudo crear el usuario.')
      return
    }

    setEmail('')
    setName('')
    setRole('user')
    setPassword('')
    setShowCreateForm(false)
    loadUsers()
  }

  async function patchUser(userId: number, payload: Record<string, unknown>) {
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el usuario.')
    await loadUsers()
    return data
  }

  async function handleSetActive(target: UserRow, isActive: boolean) {
    setActionError('')
    try {
      await patchUser(target.id, { action: 'set_active', is_active: isActive })
    } catch (err: any) {
      setActionError(err.message)
    }
  }

  async function updateRoadmapAccess(target: UserRow, canViewAllRoadmaps: boolean, roadmapIds: number[]) {
    setActionError('')
    setAccessSaving(current => ({ ...current, [target.id]: true }))
    try {
      await patchUser(target.id, {
        action: 'set_roadmap_access',
        can_view_all_roadmaps: canViewAllRoadmaps,
        roadmap_ids: roadmapIds
      })
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setAccessSaving(current => ({ ...current, [target.id]: false }))
    }
  }

  function handleRoadmapToggle(target: UserRow, roadmapId: number, enabled: boolean) {
    const currentIds = target.roadmap_access_ids || []
    const nextIds = enabled
      ? Array.from(new Set([...currentIds, roadmapId]))
      : currentIds.filter(id => id !== roadmapId)
    updateRoadmapAccess(target, false, nextIds)
  }

  async function handleResetPassword(target: UserRow) {
    setActionError('')
    const nextPassword = resetPasswords[target.id] || ''
    if (nextPassword.length < 12) {
      setResetFeedback(current => ({
        ...current,
        [target.id]: { type: 'error', message: 'La contraseña debe tener al menos 12 caracteres.' }
      }))
      return
    }
    setResetFeedback(current => ({ ...current, [target.id]: undefined }))
    try {
      await patchUser(target.id, { action: 'reset_password', password: nextPassword })
      setResetPasswords(current => ({ ...current, [target.id]: '' }))
      setResetFeedback(current => ({
        ...current,
        [target.id]: { type: 'success', message: 'Contraseña actualizada correctamente.' }
      }))
    } catch (err: any) {
      setResetFeedback(current => ({
        ...current,
        [target.id]: { type: 'error', message: err.message }
      }))
    }
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
            <p className="mt-2 text-sm">Necesitas una cuenta admin para gestionar usuarios.</p>
            <Link href="/login" className="mt-4 inline-flex rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white">Entrar</Link>
          </section>
        </main>
      </Layout>
    )
  }

  return (
    <Layout>
      <Head>
        <title>{`Usuarios | ${branding.productName}`}</title>
      </Head>

      <main>
        <section className="app-band">
          <div className="container flex flex-col gap-4 py-8 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Admin</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Usuarios</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Crea cuentas normales de lectura o nuevas cuentas admin. Las contraseñas se guardan con hash fuerte.
              </p>
            </div>
            <button
              type="button"
              aria-expanded={showCreateForm}
              onClick={() => {
                setShowCreateForm(current => !current)
                setError('')
              }}
              className={showCreateForm ? 'secondary-action self-start md:self-auto' : 'primary-action self-start md:self-auto'}
            >
              {showCreateForm ? 'Cancelar' : 'Crear usuario'}
            </button>
          </div>
        </section>

        <section className="container grid gap-6 py-8">
          {showCreateForm && (
            <form onSubmit={handleSubmit} className="panel p-5">
              <h2 className="text-lg font-semibold text-slate-950">Crear usuario</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="email@empresa.com"
                  className="form-field"
                  required
                />
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Nombre"
                  className="form-field"
                />
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as 'admin' | 'user')}
                  className="form-field"
                >
                  <option value="user">Usuario normal</option>
                  <option value="admin">Admin</option>
                </select>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Contraseña de al menos 12 caracteres"
                  minLength={12}
                  autoComplete="new-password"
                  className="form-field"
                  required
                />
                {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{error}</p>}
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button className="primary-action" disabled={saving}>
                    {saving ? 'Creando...' : 'Crear usuario'}
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-950">Cuentas existentes</h2>
              <span className="text-sm font-medium text-slate-600">
                {hasActiveFilters
                  ? `Mostrando ${filteredUsers.length} de ${users.length} ${users.length === 1 ? 'cuenta' : 'cuentas'}`
                  : `${users.length} ${users.length === 1 ? 'cuenta' : 'cuentas'}`}
              </span>
            </div>

            <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  aria-label="Buscar usuarios"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre o email..."
                  className="form-field min-w-0 flex-1 bg-white"
                />
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
              <div className="grid gap-2 sm:grid-cols-3">
                <select
                  aria-label="Filtrar por rol"
                  value={roleFilter}
                  onChange={e => setRoleFilter(e.target.value as 'all' | 'admin' | 'user')}
                  className="form-field bg-white"
                >
                  <option value="all">Todos los roles</option>
                  <option value="admin">Admins</option>
                  <option value="user">Usuarios normales</option>
                </select>
                <select
                  aria-label="Filtrar por estado"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                  className="form-field bg-white"
                >
                  <option value="all">Todos los estados</option>
                  <option value="active">Activos</option>
                  <option value="inactive">Inactivos</option>
                </select>
                <select
                  aria-label="Filtrar por acceso"
                  value={accessFilter}
                  onChange={e => setAccessFilter(e.target.value as 'all' | 'all_roadmaps' | 'restricted')}
                  className="form-field bg-white"
                >
                  <option value="all">Todo acceso</option>
                  <option value="all_roadmaps">Acceso completo</option>
                  <option value="restricted">Acceso restringido</option>
                </select>
              </div>
            </div>

            {actionError && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
            <div className="mt-4 grid gap-3">
              {users.length > 0 && filteredUsers.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                  No hay usuarios que coincidan con los filtros actuales.
                </p>
              ) : filteredUsers.map(account => {
                const isExpanded = Boolean(expandedUserIds[account.id])
                return (
                  <div key={account.id} className="rounded-lg border border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => toggleUserExpanded(account.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg p-4 text-left transition hover:bg-slate-100/70 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-950">{account.name || 'Sin nombre'}</p>
                        <p className="truncate text-sm text-slate-600">{account.email}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-sm">
                        <span className="rounded-md bg-white px-2 py-1 text-slate-700 shadow-sm">{account.role}</span>
                        <span className={`rounded-md px-2 py-1 ${account.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {account.is_active ? 'activo' : 'inactivo'}
                        </span>
                        <span aria-hidden="true" className="ml-1 text-xs text-slate-500">
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="grid gap-4 border-t border-slate-200 px-4 pb-4 pt-4 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-950">Estado de la cuenta</span>
                          <button
                            type="button"
                            onClick={() => handleSetActive(account, !account.is_active)}
                            disabled={account.id === user?.id && Boolean(account.is_active)}
                            className="secondary-action px-2 py-1"
                          >
                            {account.is_active ? 'Desactivar' : 'Reactivar'}
                          </button>
                        </div>

                        <div>
                          <p className="font-semibold text-slate-950">Acceso a roadmaps</p>
                          {account.role === 'admin' ? (
                            <p className="mt-2 rounded-md bg-sky-50 px-3 py-2 text-sky-800">
                              Las cuentas admin pueden ver y gestionar todos los roadmaps.
                            </p>
                          ) : (
                            <div className="mt-2 grid gap-2">
                              <label className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-slate-700 shadow-sm">
                                <input
                                  type="checkbox"
                                  checked={Number(account.can_view_all_roadmaps) !== 0}
                                  disabled={Boolean(accessSaving[account.id])}
                                  onChange={e => updateRoadmapAccess(account, e.target.checked, account.roadmap_access_ids || [])}
                                  className="h-4 w-4 rounded border-slate-300"
                                />
                                <span>Puede ver todos los roadmaps</span>
                              </label>

                              {Number(account.can_view_all_roadmaps) === 0 && (
                                <div className="grid gap-2 rounded-md border border-slate-200 bg-white p-3">
                                  {roadmaps.length > 0 ? (
                                    roadmaps.map(roadmap => (
                                      <label key={roadmap.id} className="flex items-start gap-2 text-slate-700">
                                        <input
                                          type="checkbox"
                                          checked={(account.roadmap_access_ids || []).includes(roadmap.id)}
                                          disabled={Boolean(accessSaving[account.id])}
                                          onChange={e => handleRoadmapToggle(account, roadmap.id, e.target.checked)}
                                          className="mt-1 h-4 w-4 rounded border-slate-300"
                                        />
                                        <span>{roadmap.title}</span>
                                      </label>
                                    ))
                                  ) : (
                                    <p className="text-slate-500">No hay roadmaps disponibles.</p>
                                  )}
                                </div>
                              )}

                              {accessSaving[account.id] && <p className="text-xs font-medium text-slate-500">Guardando acceso...</p>}
                            </div>
                          )}
                        </div>

                        <div className="border-t border-slate-200 pt-4">
                          <form
                            onSubmit={e => {
                              e.preventDefault()
                              void handleResetPassword(account)
                            }}
                            className="flex flex-col gap-2 sm:flex-row"
                          >
                            <input
                              type="password"
                              value={resetPasswords[account.id] || ''}
                              onChange={e => {
                                setResetPasswords(current => ({ ...current, [account.id]: e.target.value }))
                                if (resetFeedback[account.id]) {
                                  setResetFeedback(current => ({ ...current, [account.id]: undefined }))
                                }
                              }}
                              placeholder="Nueva contraseña"
                              minLength={12}
                              autoComplete="new-password"
                              className="form-field min-w-0 flex-1"
                              required
                            />
                            <button
                              type="submit"
                              className="primary-action px-3"
                            >
                              Resetear
                            </button>
                          </form>
                          <p className="mt-1.5 text-xs text-slate-500">Mínimo 12 caracteres.</p>
                          {resetFeedback[account.id] && (
                            <p
                              role={resetFeedback[account.id]?.type === 'error' ? 'alert' : 'status'}
                              className={`mt-2 rounded-md p-2.5 text-xs font-medium ${
                                resetFeedback[account.id]?.type === 'error'
                                  ? 'bg-red-50 text-red-700'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {resetFeedback[account.id]?.message}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  )
}
