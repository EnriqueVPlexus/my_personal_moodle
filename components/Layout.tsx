import React from 'react'
import Header from './Header'

type Props = {
  children: React.ReactNode
}

export default function Layout({ children }: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Header />
      <div className="flex-1">
        {children}
      </div>
      <footer className="px-4 py-3 text-center text-xs text-slate-400">
        v{process.env.NEXT_PUBLIC_APP_VERSION}
      </footer>
    </div>
  )
}
