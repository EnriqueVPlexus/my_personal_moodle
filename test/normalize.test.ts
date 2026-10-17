import { describe, expect, it } from 'vitest'
import { toBoolean, toCount, toNullableNumber, withCounts } from '../lib/persistence/normalize'

describe('toCount', () => {
  it('turns pg numeric text into numbers and leaves numbers alone', () => {
    expect(toCount('12')).toBe(12)
    expect(toCount(12)).toBe(12)
    expect(toCount('0')).toBe(0)
    expect(toCount(BigInt(7))).toBe(7)
    expect(toCount('3.5')).toBe(3.5)
  })

  it('maps missing or non numeric values to 0', () => {
    expect(toCount(null)).toBe(0)
    expect(toCount(undefined)).toBe(0)
    expect(toCount('abc')).toBe(0)
    expect(toCount(NaN)).toBe(0)
  })
})

describe('toNullableNumber', () => {
  it('keeps null for empty aggregates and converts the rest', () => {
    expect(toNullableNumber(null)).toBeNull()
    expect(toNullableNumber(undefined)).toBeNull()
    expect(toNullableNumber('abc')).toBeNull()
    expect(toNullableNumber('4')).toBe(4)
    expect(toNullableNumber(0)).toBe(0)
  })
})

describe('toBoolean', () => {
  it('accepts the SQLite and PostgreSQL spellings of true', () => {
    for (const value of [1, true, '1', 't', 'true', 'TRUE', ' true ']) expect(toBoolean(value), String(value)).toBe(true)
  })

  it('treats the spellings of false and missing values as false', () => {
    for (const value of [0, false, '0', 'f', 'false', '', null, undefined]) expect(toBoolean(value), String(value)).toBe(false)
  })
})

describe('withCounts', () => {
  it('converts only the listed columns and does not mutate the row', () => {
    const row = { id: 1, title: 'AWS', module_count: '4', other: '5' }
    const normalized = withCounts(row, ['module_count'])

    expect(normalized).toEqual({ id: 1, title: 'AWS', module_count: 4, other: '5' })
    expect(row.module_count).toBe('4')
  })

  it('skips columns the row does not have', () => {
    expect(withCounts({ id: 1 } as { id: number; module_count?: unknown }, ['module_count'])).toEqual({ id: 1 })
  })
})
