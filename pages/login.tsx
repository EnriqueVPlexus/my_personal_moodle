import React, { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '../components/Layout'
import { useAuth } from '../components/AuthProvider'
import { branding } from '../lib/branding'

export default function LoginPage() {
  const router = useRouter()
  const { refresh } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    setLoading(false)
    if (!res.ok) {
      setError('Credenciales no válidas.')
      return
    }

    await refresh()
    router.push(typeof router.query.next === 'string' ? router.query.next : '/roadmaps')
  }

  return (
    <Layout>
      <Head>
        <title>{`Acceso | ${branding.productName}`}</title>
      </Head>

      <main className="container py-10">
        <section className="panel mx-auto max-w-md p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Acceso</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">Entrar en la plataforma</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Los usuarios normales pueden consultar las rutas. Solo admin puede crear o modificar contenido.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@empresa.com"
              autoComplete="email"
              className="form-field"
              required
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Contraseña"
              autoComplete="current-password"
              className="form-field"
              required
            />
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button className="primary-action" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="mt-4 text-sm text-slate-600">
            Primera instalación: <Link href="/setup" className="font-medium text-sky-700 hover:underline">crear admin inicial</Link>.
          </p>
        </section>
      </main>
    </Layout>
  )
}
