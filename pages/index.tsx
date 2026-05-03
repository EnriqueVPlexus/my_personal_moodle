import Head from 'next/head'
import Link from 'next/link'
import Layout from '../components/Layout'

export default function Home() {
  return (
    <Layout>
      <Head>
        <title>my_personal_moodle</title>
      </Head>

      <main className="container py-10">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <section className="rounded-lg border border-blue-100 bg-white p-7 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Aprendizaje estructurado</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-950">Roadmaps formativos</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600">
              Gestiona rutas, módulos, prácticas y evidencias de progreso para perfiles técnicos en crecimiento.
            </p>
            <Link
              href="/roadmaps"
              className="mt-6 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Ver roadmaps
            </Link>
          </section>

          <section className="grid gap-3">
            {['Rutas por módulos', 'Recursos clicables', 'Prácticas y evidencias'].map(item => (
              <div key={item} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <span className="text-sm font-semibold text-emerald-700">{item}</span>
              </div>
            ))}
          </section>
        </div>
      </main>
    </Layout>
  )
}
