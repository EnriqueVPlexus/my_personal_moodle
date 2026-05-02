import React from 'react'

type Props = {
  title: string
}

export default function ModuleCard({ title }: Props) {
  return (
    <div className="border p-3 rounded">
      <h4 className="font-medium">{title}</h4>
    </div>
  )
}
