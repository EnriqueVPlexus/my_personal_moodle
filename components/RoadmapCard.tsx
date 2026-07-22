import React from 'react'

type Props = {
  title: string
  description?: string
  moduleCount?: number
  category?: string | null
  topics?: string[]
}

export default function RoadmapCard({ title, description, moduleCount, category, topics = [] }: Props) {
  return (
    <article className="h-full rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Ruta formativa</p>
          <h3 className="mt-2 text-lg font-semibold leading-snug text-slate-950">{title}</h3>
        </div>
        {typeof moduleCount === 'number' && (
          <span className="shrink-0 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            {moduleCount} módulos
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-md bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">
          {category || 'Sin clasificar'}
        </span>
        {topics.slice(0, 3).map(topic => (
          <span key={topic} className="rounded-md bg-slate-100 px-2.5 py-1 text-slate-600">{topic}</span>
        ))}
      </div>
      {description && <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{description}</p>}
      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
        <span className="font-medium text-slate-700">Ver itinerario</span>
        <span className="text-sky-700">Detalles</span>
      </div>
    </article>
  )
}
