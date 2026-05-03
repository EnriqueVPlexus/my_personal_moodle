import React from 'react'

type Props = {
  value: number
}

export default function ProgressBar({ value }: Props) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="w-full bg-gray-200 rounded h-3 overflow-hidden">
      <div className="bg-blue-500 h-full" style={{ width: `${pct}%` }} />
    </div>
  )
}
