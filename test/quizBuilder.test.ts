import { describe, expect, it } from 'vitest'
import {
  QUIZ_QUESTIONS_PER_ATTEMPT,
  buildAttemptQuiz,
  buildModuleQuiz,
  buildQuizFromBank,
  buildRandomQuizFromBank,
  gradeQuizQuestions,
  quizFromQuestions
} from '../lib/domains/content/quizzes'

/** Deterministic pseudo random source. */
function lcg(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const bank = Array.from({ length: 12 }, (_v, i) => ({
  question: `Question ${i}?`,
  answer: `right-${i}`,
  options: [`wrong-${i}-a`, `right-${i}`, `wrong-${i}-b`, `wrong-${i}-c`],
  explanation: `why ${i}`
}))

const moduleSource = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  roadmap_id: 4,
  title: 'Docker',
  quiz_bank: JSON.stringify(bank),
  ...overrides
})

describe('buildRandomQuizFromBank', () => {
  it('selects up to the per-attempt limit from a larger bank', () => {
    const questions = buildRandomQuizFromBank(bank, lcg(1))
    expect(questions).toHaveLength(QUIZ_QUESTIONS_PER_ATTEMPT)
    expect(new Set(questions.map(q => q.id)).size).toBe(QUIZ_QUESTIONS_PER_ATTEMPT)
  })

  it('serves the whole bank when it is smaller than the limit', () => {
    expect(buildRandomQuizFromBank(bank.slice(0, 3), lcg(1))).toHaveLength(3)
    expect(buildRandomQuizFromBank([], lcg(1))).toEqual([])
  })

  it('uses stable ids from the position in the stored bank, not the shuffled position', () => {
    for (const question of buildRandomQuizFromBank(bank, lcg(3))) {
      const bankIndex = Number(question.id.replace('bank-', ''))
      expect(question.id).toBe(`bank-${bankIndex}`)
      expect(question.prompt).toBe(`Question ${bankIndex}?`)
      expect(question.explanation).toBe(`why ${bankIndex}`)
    }
  })

  it('permutes the options and keeps correct_option_index on the right answer', () => {
    for (const question of buildRandomQuizFromBank(bank, lcg(9))) {
      const bankIndex = Number(question.id.replace('bank-', ''))
      expect([...question.options].sort()).toEqual([...bank[bankIndex].options].sort())
      expect(question.options[question.correct_option_index]).toBe(`right-${bankIndex}`)
    }
  })

  it('is reproducible for the same random source and differs between sources', () => {
    expect(buildRandomQuizFromBank(bank, lcg(5))).toEqual(buildRandomQuizFromBank(bank, lcg(5)))
    const selections = new Set(
      Array.from({ length: 10 }, (_v, seed) => buildRandomQuizFromBank(bank, lcg(seed + 100)).map(q => q.id).join())
    )
    expect(selections.size).toBeGreaterThan(1)
  })

  it('builds options for entries without explicit ones, with the correct answer among them', () => {
    const questions = buildRandomQuizFromBank(
      [{ question: 'Q?', answer: 'A' }, { question: 'R?', answer: 'B' }, { question: 'S?', answer: 'C' }],
      lcg(2)
    )
    for (const question of questions) {
      const expected = { 'bank-0': 'A', 'bank-1': 'B', 'bank-2': 'C' }[question.id as 'bank-0']
      expect(question.options[question.correct_option_index]).toBe(expected)
    }
  })
})

describe('buildQuizFromBank (deterministic preview)', () => {
  it('is stable for the same module and ids point at the stored bank', () => {
    const first = buildQuizFromBank(bank, 7)
    expect(buildQuizFromBank(bank, 7)).toEqual(first)
    expect(first).toHaveLength(QUIZ_QUESTIONS_PER_ATTEMPT)
    for (const question of first) {
      const bankIndex = Number(question.id.replace('bank-', ''))
      expect(question.prompt).toBe(`Question ${bankIndex}?`)
      expect(question.options[question.correct_option_index]).toBe(`right-${bankIndex}`)
    }
  })

  it('differs between modules', () => {
    const ids = (moduleId: number) => buildQuizFromBank(bank, moduleId).map(q => q.id).join()
    expect(new Set([1, 2, 3, 4, 5, 6].map(ids)).size).toBeGreaterThan(1)
  })
})

describe('buildAttemptQuiz', () => {
  it('uses the random selection when the module has a bank', () => {
    const quiz = buildAttemptQuiz(moduleSource(), lcg(11))
    expect(quiz).toMatchObject({ scope: 'module', module_id: 7, roadmap_id: 4, title: 'Docker' })
    expect(quiz.questions).toHaveLength(QUIZ_QUESTIONS_PER_ATTEMPT)
  })

  it('falls back to the deterministic generated quiz without a usable bank', () => {
    const generated = moduleSource({ quiz_bank: 'not json', contents: '["AMI"]', practical_activity: '["Crear"]' })
    expect(buildAttemptQuiz(generated, lcg(1))).toEqual(buildModuleQuiz(generated))
    expect(buildAttemptQuiz(moduleSource({ quiz_bank: '[]' }), lcg(1)).questions).toEqual([])
  })
})

describe('gradeQuizQuestions', () => {
  it('grades a stored snapshot and applies the pass percentage', () => {
    const questions = buildRandomQuizFromBank(bank, lcg(4))
    const allRight = Object.fromEntries(questions.map(q => [q.id, q.correct_option_index]))
    expect(gradeQuizQuestions(questions, allRight)).toMatchObject({ score: 5, max_score: 5, percentage: 100, passed: true })

    const oneWrong = { ...allRight, [questions[0].id]: (questions[0].correct_option_index + 1) % questions[0].options.length }
    expect(gradeQuizQuestions(questions, oneWrong, 90)).toMatchObject({ score: 4, percentage: 80, passed: false })
    expect(gradeQuizQuestions(questions, oneWrong, 80).passed).toBe(true)
  })

  it('wraps a snapshot into the module quiz shape', () => {
    const questions = buildRandomQuizFromBank(bank, lcg(4))
    expect(quizFromQuestions(moduleSource(), questions)).toMatchObject({ module_id: 7, title: 'Docker', questions })
  })
})
