import fs from 'fs'
import path from 'path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { validateRoadmapImport } from '../lib/domains/content/import'
import { roadmapImportCases } from './fixtures/roadmapImportCases'

/**
 * Characterization of `validateRoadmapImport`: every input in
 * `fixtures/roadmapImportCases.ts` must keep producing the output recorded in
 * `fixtures/roadmapImportExpected.json` (valid flag, normalized roadmap and the
 * exact `{ path, message }` issues shown to the admin).
 *
 * Issues are compared as a sorted list: the set of messages and paths is the
 * contract; the relative order of issues from different fields is not.
 */
const FIXED_NOW = '2026-10-16T12:00:00.000Z'

type Expected = { valid: boolean; issues: Array<{ path: string; message: string }>; roadmap: unknown }

const expected: Record<string, Expected> = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'roadmapImportExpected.json'), 'utf8')
)

const sortIssues = (issues: Array<{ path: string; message: string }>) =>
  [...issues].sort((a, b) => `${a.path}\u0000${a.message}`.localeCompare(`${b.path}\u0000${b.message}`))

describe('roadmap import characterization', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FIXED_NOW))
  })
  afterAll(() => vi.useRealTimers())

  it('has a recorded expectation for every case and no stale ones', () => {
    const names = roadmapImportCases.map(([name]) => name)
    expect(new Set(names).size).toBe(names.length)
    expect(Object.keys(expected).sort()).toEqual([...names].sort())
  })

  it.each(roadmapImportCases)('%s', (name, input) => {
    const actual = validateRoadmapImport(input)
    const want = expected[name]
    expect(actual.valid).toBe(want.valid)
    expect(sortIssues(actual.issues)).toEqual(sortIssues(want.issues))
    expect(JSON.parse(JSON.stringify(actual.roadmap))).toEqual(want.roadmap)
  })
})
