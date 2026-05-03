import React from 'react'

type Props = {
  title: string
}

export default function LessonCard({ title }: Props) {
  return (
    <div className="p-2">
      <div className="text-sm">{title}</div>
    </div>
  )
}
