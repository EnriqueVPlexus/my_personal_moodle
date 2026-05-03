import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from './AuthProvider'

export default function Header() {
  const router = useRouter()
  const { user, isAdmin, logout } = useAuth()

  async function handleLogout() {
    await logout()
    router.push('/login')
  }

  return (
    <header className="border-b border-gray-200 bg-white/90 shadow-sm backdrop-blur">
      <div className="container flex items-center justify-between py-4">
        <Link href="/" className="text-lg font-bold text-gray-950">my_personal_moodle</Link>
        <nav className="flex items-center gap-2">
          <Link href="/roadmaps" className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-950">Roadmaps</Link>
          {isAdmin && (
            <Link href="/admin/users" className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-950">Usuarios</Link>
          )}
          {user ? (
            <>
              <span className="hidden rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700 md:inline">
                {user.email} · {user.role}
              </span>
              <button onClick={handleLogout} className="rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
                Salir
              </button>
            </>
          ) : (
            <Link href="/login" className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">Entrar</Link>
          )}
        </nav>
      </div>
    </header>
  )
}
