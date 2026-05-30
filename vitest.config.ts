import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      reportsDirectory: 'coverage',
      include: [
        'components/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
        'pages/api/**/*.{ts,tsx}'
      ],
      exclude: [
        'lib/awsRoadmapSeed.json'
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
