import Link from 'next/link'

export default function Header() {
  return (
    <header className="bg-white shadow">
      <div className="container py-4 flex items-center justify-between">
        <Link href="/">
          <a className="text-lg font-bold">my_personal_moodle</a>
        </Link>
        <nav>
          <Link href="/roadmaps">
            <a className="text-sm text-gray-600">Roadmaps</a>
          </Link>
        </nav>
      </div>
    </header>
  )
}
