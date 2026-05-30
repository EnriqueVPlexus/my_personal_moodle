import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { useAuth } from '../../components/AuthProvider'
import { branding } from '../../lib/branding'

type UserRow = {
  id: number
  email: string
  name?: string | null
  role: 'admin' | 'user'
  is_active: number
  can_view_all_roadmaps: number
  roadmap_access_ids: number[]
  created_at: string
}

type RoadmapRow = {
  id: number
  title: string
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
  const [resetPasswords, setResetPasswords] = useState<Record<number, string>>({})
  const [accessSaving, setAccessSaving] = useState<Record<number, boolean>>({})

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
    try {
      await patchUser(target.id, { action: 'reset_password', password: resetPasswords[target.id] || '' })
      setResetPasswords(current => ({ ...current, [target.id]: '' }))
    } catch (err: any) {
      setActionError(err.message)
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
          <div className="container py-8">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Admin</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Usuarios</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Crea cuentas normales de lectura o nuevas cuentas admin. Las contraseñas se guardan con hash fuerte.
            </p>
          </div>
        </section>

        <section className="container grid gap-6 py-8 lg:grid-cols-[0.72fr_1.28fr]">
          <form onSubmit={handleSubmit} className="panel p-5">
            <h2 className="text-lg font-semibold text-slate-950">Crear usuario</h2>
            <div className="mt-4 grid gap-3">
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
              {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <button className="primary-action" disabled={saving}>
                {saving ? 'Creando...' : 'Crear usuario'}
              </button>
            </div>
          </form>

          <div className="panel p-5">
            <h2 className="text-lg font-semibold text-slate-950">Cuentas existentes</h2>
            {actionError && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
            <div className="mt-4 grid gap-3">
              {users.map(account => (
                <div key={account.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">{account.email}</p>
                      <p className="text-sm text-slate-600">{account.name || 'Sin nombre'}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm md:justify-end">
                      <span className="rounded-md bg-white px-2 py-1 text-slate-700 shadow-sm">{account.role}</span>
                      <span className={`rounded-md px-2 py-1 ${account.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {account.is_active ? 'activo' : 'inactivo'}
                      </span>
                      <button
                        onClick={() => handleSetActive(account, !account.is_active)}
                        disabled={account.id === user?.id && Boolean(account.is_active)}
                        className="secondary-action px-2 py-1"
                      >
                        {account.is_active ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 text-sm">
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

                    <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row">
                      <input
                        type="password"
                        value={resetPasswords[account.id] || ''}
                        onChange={e => setResetPasswords(current => ({ ...current, [account.id]: e.target.value }))}
                        placeholder="Nueva contraseña"
                        minLength={12}
                        className="form-field min-w-0 flex-1"
                      />
                      <button
                        onClick={() => handleResetPassword(account)}
                        className="primary-action px-3"
                      >
                        Resetear
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  )
}
