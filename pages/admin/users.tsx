import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { useAuth } from '../../components/AuthProvider'

type UserRow = {
  id: number
  email: string
  name?: string | null
  role: 'admin' | 'user'
  is_active: number
  created_at: string
}

export default function AdminUsersPage() {
  const { user, isAdmin, loading } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [resetPasswords, setResetPasswords] = useState<Record<number, string>>({})

  async function loadUsers() {
    const res = await fetch('/api/users')
    if (res.ok) setUsers(await res.json())
  }

  useEffect(() => {
    if (isAdmin) loadUsers()
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
        <main className="container py-8">Comprobando permisos...</main>
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
      <main className="container py-8">
        <section className="rounded-lg border border-blue-100 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Admin</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950">Usuarios</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Crea cuentas normales de lectura o nuevas cuentas admin. Las contraseñas se guardan con hash fuerte.
          </p>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">Crear usuario</h2>
            <div className="mt-4 grid gap-3">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@empresa.com"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                required
              />
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nombre"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              <select
                value={role}
                onChange={e => setRole(e.target.value as 'admin' | 'user')}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                required
              />
              {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-300" disabled={saving}>
                {saving ? 'Creando...' : 'Crear usuario'}
              </button>
            </div>
          </form>

          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">Cuentas existentes</h2>
            {actionError && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
            <div className="mt-4 grid gap-3">
              {users.map(account => (
                <div key={account.id} className="flex flex-col gap-2 rounded-lg border border-gray-200 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-gray-950">{account.email}</p>
                    <p className="text-sm text-gray-600">{account.name || 'Sin nombre'}</p>
                  </div>
                  <div className="grid gap-3 text-sm md:min-w-[320px]">
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      <span className="rounded-md bg-gray-100 px-2 py-1 text-gray-700">{account.role}</span>
                      <span className={`rounded-md px-2 py-1 ${account.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {account.is_active ? 'activo' : 'inactivo'}
                      </span>
                      <button
                        onClick={() => handleSetActive(account, !account.is_active)}
                        disabled={account.id === user?.id && Boolean(account.is_active)}
                        className="rounded-md border border-gray-200 px-2 py-1 font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {account.is_active ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="password"
                        value={resetPasswords[account.id] || ''}
                        onChange={e => setResetPasswords(current => ({ ...current, [account.id]: e.target.value }))}
                        placeholder="Nueva contraseña"
                        minLength={12}
                        className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                      <button
                        onClick={() => handleResetPassword(account)}
                        className="rounded-md bg-blue-600 px-3 py-2 font-semibold text-white hover:bg-blue-700"
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
