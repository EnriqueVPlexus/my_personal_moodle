import Link from 'next/link'

export default function Header() {
  return (
    <header className="border-b border-gray-200 bg-white/90 shadow-sm backdrop-blur">
      <div className="container flex items-center justify-between py-4">
        <Link href="/" className="text-lg font-bold text-gray-950">my_personal_moodle</Link>
        <nav>
          <Link href="/roadmaps" className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-950">Roadmaps</Link>
        </nav>
      </div>
    </header>
  )
}
