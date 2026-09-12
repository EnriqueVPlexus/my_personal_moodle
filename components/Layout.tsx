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
    </div>
  )
}
