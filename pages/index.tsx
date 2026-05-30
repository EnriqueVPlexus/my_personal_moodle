import Head from 'next/head'
import Link from 'next/link'
import Layout from '../components/Layout'
import { branding } from '../lib/branding'

export default function Home() {
  const tracks = [
    { name: 'AWS', detail: 'Cloud foundations, servicios gestionados y buenas prácticas.' },
    { name: 'DevOps', detail: 'CI/CD, automatización, contenedores e infraestructura como código.' },
    { name: 'SRE', detail: 'Observabilidad, fiabilidad, gestión de incidentes y operación.' }
  ]

  const operatingModel = [
    'Rutas ordenadas por módulos',
    'Recursos oficiales y vídeos de apoyo',
    'Prácticas con evidencia entregable',
    'Control de acceso por rol'
  ]

  return (
    <Layout>
      <Head>
        <title>{branding.productName} | Recursos formativos</title>
      </Head>

      <main>
        <section className="app-band">
          <div className="container grid gap-10 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Cantera técnica</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">
                Un punto de entrada para los itinerarios formativos internos.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
                {branding.productName} organiza roadmaps, módulos, recursos y entregables para que cada persona sepa qué aprender,
                en qué orden avanzar y cómo demostrar progreso.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/roadmaps"
                  className="inline-flex items-center rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
                >
                  Explorar roadmaps
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Acceso privado
                </Link>
              </div>
            </div>

            <div className="panel p-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Catálogo</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">Tracks principales</h2>
                </div>
                <span className="rounded-md bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">Libre</span>
              </div>

              <div className="mt-4 grid gap-3">
                {tracks.map(track => (
                  <div key={track.name} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-sm font-bold text-slate-900 shadow-sm">
                        {track.name.slice(0, 2)}
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-950">{track.name}</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{track.detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="container py-10">
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {operatingModel.map(item => (
              <div key={item} className="panel p-4">
                <span className="block text-sm font-semibold text-slate-950">{item}</span>
              </div>
            ))}
          </section>

          <section className="mt-8 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="panel p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Uso interno</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">Preparada para formar y gobernar contenido</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Los perfiles de lectura consultan itinerarios y enlaces. Las cuentas admin crean usuarios, mantienen rutas y revisan
                acciones sensibles desde auditoría.
              </p>
            </div>

            <div className="panel overflow-hidden">
              <div className="grid border-b border-slate-200 bg-slate-950 px-5 py-4 text-sm font-semibold text-white sm:grid-cols-[1fr_1fr_auto]">
                <span>Flujo</span>
                <span className="hidden sm:block">Salida esperada</span>
                <span className="hidden sm:block">Rol</span>
              </div>
              {[
                ['Elegir roadmap', 'Ruta AWS, DevOps, SRE o interna', 'Usuario'],
                ['Completar módulo', 'Práctica y evidencia entregable', 'Usuario'],
                ['Actualizar contenidos', 'Recursos curados y versionados', 'Admin']
              ].map(([flow, result, role]) => (
                <div key={flow} className="grid gap-1 border-b border-slate-100 px-5 py-4 text-sm last:border-b-0 sm:grid-cols-[1fr_1fr_auto]">
                  <span className="font-medium text-slate-950">{flow}</span>
                  <span className="text-slate-600">{result}</span>
                  <span className="font-semibold text-slate-700">{role}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </Layout>
  )
}
