import { describe, expect, it } from 'vitest'
import awsSeed from '../lib/persistence/bootstrap/seeds/awsRoadmapSeed.json'
import awsQuizzes from '../lib/persistence/bootstrap/seeds/awsRoadmapQuizzes.json'
import { getSeedQuizForModule } from '../lib/persistence/bootstrap/seeds/quizBanks'

// Modules without a dedicated quiz in awsRoadmapQuizzes.json fall back to the
// single-question bank in quizBanks.ts.
const MODULES_WITHOUT_DEDICATED_QUIZ = ['Proyecto final']

describe('AWS roadmap seed quizzes', () => {
  it('attaches the dedicated quiz to every AWS module', () => {
    for (const seedModule of awsSeed.modules) {
      const dedicated = awsQuizzes.quizzes.find(quiz => quiz.moduleTitle === seedModule.title)
      const seeded = getSeedQuizForModule(seedModule.title)

      if (MODULES_WITHOUT_DEDICATED_QUIZ.includes(seedModule.title)) {
        expect(dedicated, seedModule.title).toBeUndefined()
        expect(seeded.length, seedModule.title).toBeGreaterThan(0)
        continue
      }

      expect(dedicated, `missing quiz for module "${seedModule.title}"`).toBeDefined()
      expect(seeded.map(question => question.question), seedModule.title)
        .toEqual(dedicated!.questions.map(question => question.question))
    }
  })

  it('has no orphan quiz without a matching module', () => {
    const titles = new Set(awsSeed.modules.map(seedModule => seedModule.title))
    for (const quiz of awsQuizzes.quizzes) {
      expect(titles.has(quiz.moduleTitle), `orphan quiz "${quiz.moduleTitle}"`).toBe(true)
    }
  })

  it('maps each question to a valid correct answer among its options', () => {
    for (const seedModule of awsSeed.modules) {
      for (const question of getSeedQuizForModule(seedModule.title)) {
        expect(question.options, question.question).toContain(question.answer)
      }
    }
  })
})
