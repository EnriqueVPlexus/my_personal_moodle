import { readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { isApiHandler } from '../lib/http/errors'

vi.mock('../lib/persistence', () => ({ openDb: vi.fn(async () => ({})) }))

const API_DIR = resolve(__dirname, '../pages/api')

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? routeFiles(join(dir, entry.name)) : [join(dir, entry.name)]
  )
}

const files = routeFiles(API_DIR).sort()

describe('pages/api routes', () => {
  it('finds the routes', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map(file => [relative(API_DIR, file), file]))(
    '%s default-exports a handler wrapped with withApiErrors',
    async (_name, file) => {
      const mod = await import(/* @vite-ignore */ file)
      expect(
        isApiHandler(mod.default),
        'Wrap the default export: `export default withApiErrors(handler)` (lib/http/errors.ts)'
      ).toBe(true)
    }
  )
})
