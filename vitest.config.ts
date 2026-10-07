import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    // Real-Postgres tests have their own config (vitest.integration.config.ts).
    exclude: [...configDefaults.exclude, 'test/postgres-integration/**'],
    // openDb() switches to Postgres whenever DATABASE_URL is set (e.g. loaded
    // by direnv from .env.local). Blank it so unit tests always use SQLite and
    // never touch a real database.
    env: {
      DATABASE_URL: '',
      TEST_DATABASE_URL: ''
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      reportsDirectory: 'coverage',
      include: [
        'components/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
        'pages/**/*.{ts,tsx}'
      ],
      exclude: [
        'lib/roadmapSeeds/**/*.json'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    }
  }
})
