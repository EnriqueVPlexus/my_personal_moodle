import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from './AuthProvider'
import { branding } from '../lib/branding'

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter()
  const active = router.pathname === href || router.pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-2 text-sm font-medium transition ${
        active
          ? 'bg-slate-900 text-white shadow-sm'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
      }`}
    >
      {children}
    </Link>
  )
}

export default function Header() {
  const router = useRouter()
  const { user, isAdmin, logout } = useAuth()

  async function handleLogout() {
    await logout()
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="container flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <Image
            src={branding.logoSrc}
            alt={`${branding.companyName} logo`}
            width={160}
            height={40}
            className="h-10 w-auto max-w-[160px] shrink-0 object-contain"
          />
          <span className="min-w-0">
            <span className="block truncate text-base font-bold text-slate-950">{branding.productName}</span>
            <span className="block truncate text-xs font-medium text-slate-500">{branding.companyName}</span>
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-2">
          <NavLink href="/roadmaps">Roadmaps</NavLink>
          {user && <NavLink href="/my-roadmaps">Mi progreso</NavLink>}
          {isAdmin && (
            <>
              <NavLink href="/admin/users">Usuarios</NavLink>
              <NavLink href="/admin/audit">Auditoría</NavLink>
            </>
          )}
          {user ? (
            <>
              <span className="hidden rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 lg:inline">
                {user.email} · {user.role}
              </span>
              <button onClick={handleLogout} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100">
                Salir
              </button>
            </>
          ) : (
            <Link href="/login" className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700">Entrar</Link>
          )}
        </nav>
      </div>
    </header>
  )
}
