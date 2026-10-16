import { describe, expect, it } from 'vitest'
import { publishedAtField, roadmapVersionField } from '../lib/domains/content/roadmapFields'
import { DEFAULT_ROADMAP_VERSION, normalizePublishedAt, normalizeRoadmapVersion } from '../lib/domains/content/version'

const versionField = roadmapVersionField('versión no válida')
const dateField = publishedAtField('fecha no válida')

const samples: unknown[] = [undefined, null, '', 'v1.2.3', ' v1.2.3 ', 'v1.2', '1.2.3', '  ', 7, {}, '2026-10-16', '2026-10-16T10:00:00Z', 'ayer', true]

describe('roadmap version and published_at fields', () => {
  it.each(samples.map(value => [JSON.stringify(value) ?? 'undefined', value]))(
    'the version field agrees with normalizeRoadmapVersion for %s',
    (_label, value) => {
      const expected = normalizeRoadmapVersion(value)
      const parsed = versionField.safeParse(value)
      if (expected === null) {
        expect(parsed.success).toBe(false)
        if (!parsed.success) expect(parsed.error.issues[0].message).toBe('versión no válida')
      } else {
        expect(parsed).toMatchObject({ success: true, data: expected })
      }
    }
  )

  it.each(samples.map(value => [JSON.stringify(value) ?? 'undefined', value]))(
    'the published_at field agrees with normalizePublishedAt for %s',
    (_label, value) => {
      const parsed = dateField.safeParse(value)
      if (normalizePublishedAt(value) === null) {
        expect(parsed.success).toBe(false)
        if (!parsed.success) expect(parsed.error.issues[0].message).toBe('fecha no válida')
      } else {
        expect(parsed.success).toBe(true)
        if (typeof value === 'string' && value && parsed.success) expect(parsed.data).toBe(new Date(value).toISOString())
      }
    }
  )

  it('defaults a missing version', () => {
    expect(versionField.parse(undefined)).toBe(DEFAULT_ROADMAP_VERSION)
  })
})
