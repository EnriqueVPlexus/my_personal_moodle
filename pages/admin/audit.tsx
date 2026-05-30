import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { useAuth } from '../../components/AuthProvider'
import { branding } from '../../lib/branding'

type AuditRow = {
  id: number
  actor_email?: string | null
  action: string
  entity_type: string
  entity_id?: string | null
  details?: string | null
  ip_address?: string | null
  created_at: string
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

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/audit-logs')
      .then(res => res.ok ? res.json() : [])
      .then(setLogs)
  }, [isAdmin])

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
        <title>Auditoría | {branding.productName}</title>
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
          {logs.length > 0 ? (
            logs.map(log => (
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
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
              Todavía no hay eventos de auditoría.
            </p>
          )}
        </section>
      </main>
    </Layout>
  )
}
