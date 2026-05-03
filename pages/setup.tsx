import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '../components/Layout'
import { useAuth } from '../components/AuthProvider'

type SetupStatus = {
  needsSetup: boolean
  requiresToken: boolean
  productionRequiresToken: boolean
}

export default function SetupPage() {
  const router = useRouter()
  const { refresh } = useAuth()
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [setupToken, setSetupToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/auth/setup-status')
      .then(res => res.json())
      .then(setStatus)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password, setupToken })
    })

    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(data.error || 'No se pudo completar el setup.')
      return
    }

    await refresh()
    router.push('/roadmaps')
  }

  return (
    <Layout>
      <main className="container py-10">
        <section className="mx-auto max-w-xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Setup seguro</p>
          <h1 className="mt-2 text-2xl font-bold text-gray-950">Crear admin inicial</h1>

          {!status && <p className="mt-4 text-sm text-gray-600">Comprobando estado...</p>}

          {status && !status.needsSetup && (
            <div className="mt-5 rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">
              Ya existe al menos un usuario. Entra con una cuenta admin para crear más usuarios desde el panel.
              <div className="mt-3">
                <Link href="/login" className="font-semibold text-emerald-900 hover:underline">Ir al login</Link>
              </div>
            </div>
          )}

          {status?.needsSetup && (
            <>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                Esta pantalla solo permite crear el primer admin. En producción debes definir `AUTH_SETUP_TOKEN`.
              </p>
              {status.productionRequiresToken && !status.requiresToken && (
                <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
                  Setup bloqueado: falta `AUTH_SETUP_TOKEN` en producción.
                </p>
              )}

              <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Email admin"
                  autoComplete="email"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  required
                />
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Nombre"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Contraseña de al menos 12 caracteres"
                  autoComplete="new-password"
                  minLength={12}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  required
                />
                {status.requiresToken && (
                  <input
                    type="password"
                    value={setupToken}
                    onChange={e => setSetupToken(e.target.value)}
                    placeholder="AUTH_SETUP_TOKEN"
                    autoComplete="one-time-code"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    required
                  />
                )}
                {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-300" disabled={loading || (status.productionRequiresToken && !status.requiresToken)}>
                  {loading ? 'Creando admin...' : 'Crear admin'}
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    </Layout>
  )
}
