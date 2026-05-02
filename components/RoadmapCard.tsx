import React from 'react'

type Props = {
  title: string
  description?: string
}

export default function RoadmapCard({ title, description }: Props) {
  return (
    <div className="bg-white p-4 rounded shadow-sm">
      <h3 className="font-medium">{title}</h3>
      {description && <p className="text-sm text-gray-500">{description}</p>}
    </div>
  )
}
