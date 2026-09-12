import type { ReactNode } from 'react'
import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from './AuthProvider'
import { branding } from '../lib/branding'

function NavLink({ href, children, exact = false }: { href: string; children: ReactNode; exact?: boolean }) {
  const router = useRouter()
  const active = router.pathname === href || (!exact && router.pathname.startsWith(`${href}/`))

  return (
    <Link
      href={href}
      className={`rounded-md px-2 py-1 text-sm font-medium transition ${
        active
          ? 'bg-slate-900 text-white shadow-sm'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
      }`}
    >
      {children}
    </Link>
  )
}

function AdminDropdown({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (!isAdmin) return null

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950 transition"
      >
        Admin ▼
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 rounded-md bg-white border border-slate-200 shadow-lg z-50">
          <NavLink href="/admin">Dashboard</NavLink>
          <NavLink href="/admin/users">Usuarios</NavLink>
          <NavLink href="/admin/evidences">Evidencias</NavLink>
          <NavLink href="/admin/import-roadmap">Importar JSON</NavLink>
          <NavLink href="/admin/audit">Auditoría</NavLink>
        </div>
      )}
    </div>
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
      <div className="container flex flex-col gap-0 py-0 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <Image
            src={branding.logoSrc}
            alt={`${branding.companyName} logo`}
            width={200}
            height={50}
            className="h-12 w-auto max-w-[200px] shrink-0 object-contain"
          />
          <span className="min-w-0">
            <span className="block truncate text-base font-bold text-slate-950">{branding.productName}</span>
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-2">
          <NavLink href="/roadmaps">Roadmaps</NavLink>
          {user && (
            <>
              <NavLink href="/my-roadmaps">Mi progreso</NavLink>
              <NavLink href="/portfolio">Mi Portfolio</NavLink>
            </>
          )}
          <AdminDropdown isAdmin={isAdmin} />
          {user ? (
            <button onClick={handleLogout} className="text-xs text-slate-600 hover:text-slate-950 transition">
              {user.email.split('@')[0]} · <span className="underline">Log out</span>
            </button>
          ) : (
            <Link href="/login" className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700">Entrar</Link>
          )}
        </nav>
      </div>
    </header>
  )
}
