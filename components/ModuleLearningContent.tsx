import React from 'react'
import {
  LearningModule,
  asLearningLinks,
  asTextList
} from '../lib/roadmapPresentation'

type Props = {
  module: LearningModule
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</h4>
      <div className="mt-3 text-sm leading-6 text-slate-700">{children}</div>
    </section>
  )
}

function TextList({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-slate-500">Sin información definida.</p>

  return (
    <ul className="space-y-2">
      {items.map(item => (
        <li key={item} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function LinkList({ items }: { items: ReturnType<typeof asLearningLinks> }) {
  if (!items.length) return <p className="text-gray-500">Sin enlaces definidos.</p>

  return (
    <ul className="grid gap-2">
      {items.map(item => (
        <li key={`${item.label}-${item.url || 'plain'}`}>
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-sky-800 transition hover:border-sky-300 hover:bg-sky-100"
            >
              <span>{item.label}</span>
              <span className="text-xs font-semibold uppercase tracking-wide">Abrir</span>
            </a>
          ) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
              {item.label}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export default function ModuleLearningContent({ module }: Props) {
  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
        <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Objetivo</h4>
        <p className="mt-2 text-sm leading-6 text-emerald-950">{module.objective || 'Sin objetivo definido.'}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Contenidos">
          <TextList items={asTextList(module.contents)} />
        </Section>

        <Section title="Importancia">
          <p>{module.importance || 'Sin importancia definida.'}</p>
        </Section>

        <Section title="Recursos oficiales">
          <LinkList items={asLearningLinks(module.official_resources)} />
        </Section>

        <Section title="Recursos complementarios">
          <LinkList items={asLearningLinks(module.support_videos)} />
        </Section>

        <Section title="Actividad práctica">
          <TextList items={asTextList(module.practical_activity)} />
        </Section>

        <Section title="Evidencia entregable">
          <TextList items={asTextList(module.deliverable_evidence)} />
        </Section>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">Evaluación</h4>
        <p className="mt-2 text-sm leading-6 text-amber-950">{module.evaluation || 'Sin evaluación definida.'}</p>
      </div>
    </div>
  )
}
