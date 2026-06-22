import React from 'react'

type Props = {
  title: string
  objective?: string | null
  duration?: string | null
  position?: number | null
}

export default function ModuleCard({ title, objective, duration, position }: Props) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {typeof position === 'number' && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-950 text-sm font-semibold text-white">
            {position}
          </span>
        )}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-slate-950">{title}</h4>
            {duration && (
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{duration}</span>
            )}
          </div>
          {objective && <p className="mt-2 text-sm leading-6 text-slate-600">{objective}</p>}
        </div>
      </div>
    </article>
  )
}
