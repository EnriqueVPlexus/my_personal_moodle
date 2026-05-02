import Head from 'next/head'
import Layout from '../components/Layout'

export default function Home() {
  return (
    <Layout>
      <Head>
        <title>my_personal_moodle</title>
      </Head>

      <main className="container py-8">
        <h1 className="text-2xl font-semibold mb-4">Roadmaps formativos</h1>
        <p className="text-sm text-gray-600">Crea roadmaps, módulos, lecciones y marca progreso.</p>

        <div className="mt-6">
          <p className="text-gray-500">No hay roadmaps todavía — comienza creando uno.</p>
        </div>
      </main>
    </Layout>
  )
}
