import { describe, expect, it } from 'vitest'
import {
  buildQuizResultsExport,
  csvCell,
  quizPercentage,
  quizResultsFilename,
  quizResultsToCsv,
  type QuizAttemptExportRow
} from '../lib/domains/progress/quizExport'

const attempt = (overrides: Partial<QuizAttemptExportRow> = {}): QuizAttemptExportRow => ({
  attempt_id: 1,
  roadmap_id: 3,
  roadmap_title: 'DevOps',
  module_id: 9,
  module_title: 'Docker',
  quiz_scope: 'module',
  score: 3,
  max_score: 4,
  percentage: 75,
  submitted_at: '2026-10-20T10:00:00.000Z',
  ...overrides
})

describe('csvCell', () => {
  it('renders empty values and plain text as is', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell('hola')).toBe('hola')
    expect(csvCell(42)).toBe('42')
    expect(csvCell(-1)).toBe('-1')
  })

  it('quotes cells with commas, quotes and line breaks, doubling the quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('di "hola"')).toBe('"di ""hola"""')
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"')
    expect(csvCell('l1\r\nl2')).toBe('"l1\r\nl2"')
  })

  it('neutralises spreadsheet formulas with a leading single quote', () => {
    expect(csvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)")
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('-2')).toBe("'-2")
    expect(csvCell('@cmd')).toBe("'@cmd")
    expect(csvCell('\tx')).toBe("'\tx")
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"')
  })
})

describe('quiz results serialization', () => {
  const exportedAt = new Date('2026-10-26T08:30:00.000Z')

  it('computes percentages defensively', () => {
    expect(quizPercentage(3, 4)).toBe(75)
    expect(quizPercentage(1, 3)).toBe(33)
    expect(quizPercentage(1, 0)).toBe(0)
  })

  it('builds the JSON document with identity and totals', () => {
    const data = buildQuizResultsExport({ email: 'ada@example.com', name: '' }, [attempt()], exportedAt)
    expect(data).toEqual({
      exported_at: '2026-10-26T08:30:00.000Z',
      user: { email: 'ada@example.com', name: null },
      total_attempts: 1,
      attempts: [attempt()]
    })
  })

  it('serializes CSV with BOM, CRLF, identity columns and escaping', () => {
    const data = buildQuizResultsExport(
      { email: 'ada@example.com', name: '=Ada, "the" first' },
      [attempt(), attempt({ attempt_id: 2, roadmap_id: null, roadmap_title: null, module_title: 'Línea\nnueva' })],
      exportedAt
    )
    const csv = quizResultsToCsv(data)

    expect(csv.startsWith('﻿user_email,user_name,attempt_id,')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe('user_email,user_name,attempt_id,roadmap_id,roadmap_title,module_id,module_title,quiz_scope,score,max_score,percentage,submitted_at')
    expect(lines[1]).toBe('ada@example.com,"\'=Ada, ""the"" first",1,3,DevOps,9,Docker,module,3,4,75,2026-10-20T10:00:00.000Z')
    expect(lines[2]).toContain(',2,,,9,"Línea\nnueva",module,')
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('serializes an empty export as only the header', () => {
    const csv = quizResultsToCsv(buildQuizResultsExport({ email: 'a@b.c' }, [], exportedAt))
    expect(csv.slice(1).split('\r\n')).toHaveLength(2)
  })

  it('names the file after the export date', () => {
    expect(quizResultsFilename(exportedAt, 'csv')).toBe('quiz-results-2026-10-26.csv')
    expect(quizResultsFilename(exportedAt, 'json')).toBe('quiz-results-2026-10-26.json')
  })
})
