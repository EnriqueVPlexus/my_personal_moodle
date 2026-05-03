import React from 'react'
import Header from './Header'

type Props = {
  children: React.ReactNode
}

export default function Layout({ children }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      {children}
    </div>
  )
}
