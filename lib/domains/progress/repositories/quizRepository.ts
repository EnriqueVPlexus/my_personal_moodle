import { sql } from 'kysely'
import type { DatabaseClient } from '../../../persistence/database'
import type { PostgresDb } from '../../../persistence/postgresDb'
import { getQueryDatabase } from '../../../persistence/kyselyDatabase'
import {
  gradeModuleQuiz,
  type AttemptEligibility,
  type QuizGrade,
  type ModuleQuizSource,
  type ModuleQuizSummary
} from '../../content/quizzes'
import type { QuizAttemptRepository } from '../ports'

const PASSING_PERCENTAGE = 70

function pool(db: DatabaseClient) {
  return (db as PostgresDb).getPool()
}

function percentage(score: number, maxScore: number) {
  if (maxScore <= 0) return 0
  return Math.round((score / maxScore) * 100)
}

export async function insertModuleQuizAttempt(
  db: DatabaseClient,
  userId: number,
  module: ModuleQuizSource,
  answers: Record<string, unknown>,
  grade: QuizGrade
) {
  const submittedAt = new Date().toISOString()

  if (db.backend !== 'postgres') {
    await db.run(
      `INSERT INTO user_quiz_attempts (
        user_id, roadmap_id, module_id, quiz_scope, score, max_score, answers,
        submitted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        module.roadmap_id || null,
        module.id,
        'module',
        grade.score,
        grade.max_score,
        JSON.stringify({ answers, feedback: grade.feedback }),
        submittedAt,
        submittedAt,
        submittedAt
      ]
    )
  } else {
    await getQueryDatabase(pool(db))
      .insertInto('user_quiz_attempts')
      .values({
        user_id: userId,
        roadmap_id: module.roadmap_id || null,
        module_id: module.id,
        quiz_scope: 'module',
        score: grade.score,
        max_score: grade.max_score,
        answers: JSON.stringify({ answers, feedback: grade.feedback }),
        submitted_at: submittedAt,
        created_at: submittedAt,
        updated_at: submittedAt
      })
      .execute()
  }

  return {
    ...grade,
    submitted_at: submittedAt
  }
}

/** Grades the answers and stores the attempt (convenience over the port flow). */
export async function saveModuleQuizAttempt(
  db: DatabaseClient,
  userId: number,
  module: ModuleQuizSource,
  answers: Record<string, unknown>
) {
  return insertModuleQuizAttempt(db, userId, module, answers, gradeModuleQuiz(module, answers))
}

export async function getModuleQuizSummary(
  db: DatabaseClient,
  userId: number,
  moduleId: number
): Promise<ModuleQuizSummary> {
  let aggregate: any
  let latest: any

  if (db.backend !== 'postgres') {
    aggregate = await db.get(
      `SELECT
          COUNT(*) AS attempts_count,
          AVG((score * 100.0) / max_score) AS average_score_percentage,
          MAX((score * 100.0) / max_score) AS best_score_percentage
       FROM user_quiz_attempts
       WHERE user_id = ?
         AND module_id = ?
         AND max_score > 0`,
      [userId, moduleId]
    )
    latest = await db.get(
      `SELECT score, max_score, submitted_at
       FROM user_quiz_attempts
       WHERE user_id = ?
         AND module_id = ?
         AND max_score > 0
       ORDER BY datetime(submitted_at) DESC, id DESC
       LIMIT 1`,
      [userId, moduleId]
    )
  } else {
    const kdb = getQueryDatabase(pool(db))

    const aggregateResult = await sql<any>`
      SELECT
          COUNT(*) AS attempts_count,
          AVG((score * 100.0) / max_score) AS average_score_percentage,
          MAX((score * 100.0) / max_score) AS best_score_percentage
       FROM user_quiz_attempts
       WHERE user_id = ${userId}
         AND module_id = ${moduleId}
         AND max_score > 0
    `.execute(kdb)
    aggregate = aggregateResult.rows[0]

    const latestResult = await sql<any>`
      SELECT score, max_score, submitted_at
       FROM user_quiz_attempts
       WHERE user_id = ${userId}
         AND module_id = ${moduleId}
         AND max_score > 0
       ORDER BY submitted_at DESC, id DESC
       LIMIT 1
    `.execute(kdb)
    latest = latestResult.rows[0]
  }

  return {
    attempts_count: Number(aggregate?.attempts_count || 0),
    average_score_percentage: aggregate?.average_score_percentage === null || aggregate?.average_score_percentage === undefined
      ? null
      : Math.round(Number(aggregate.average_score_percentage)),
    best_score_percentage: aggregate?.best_score_percentage === null || aggregate?.best_score_percentage === undefined
      ? null
      : Math.round(Number(aggregate.best_score_percentage)),
    latest_attempt: latest
      ? {
        score: Number(latest.score || 0),
        max_score: Number(latest.max_score || 0),
        percentage: percentage(Number(latest.score || 0), Number(latest.max_score || 0)),
        submitted_at: latest.submitted_at
      }
      : null
  }
}

export async function checkAttemptEligibility(
  db: DatabaseClient,
  userId: number,
  module: ModuleQuizSource
): Promise<AttemptEligibility> {
  const passPct = module.quiz_pass_percentage ?? PASSING_PERCENTAGE
  const maxAttempts = module.quiz_max_attempts ?? null
  const cooldownMinutes = module.quiz_cooldown_minutes ?? null

  let count = 0

  if (db.backend !== 'postgres') {
    const attemptsCount = await db.get(
      `SELECT COUNT(*) AS cnt FROM user_quiz_attempts
       WHERE user_id = ? AND module_id = ? AND max_score > 0`,
      [userId, module.id]
    )
    count = Number(attemptsCount?.cnt || 0)
  } else {
    const kdb = getQueryDatabase(pool(db))
    const attemptsCountResult = await sql<any>`
      SELECT COUNT(*) AS cnt FROM user_quiz_attempts
       WHERE user_id = ${userId} AND module_id = ${module.id} AND max_score > 0
    `.execute(kdb)
    count = Number(attemptsCountResult.rows[0]?.cnt || 0)
  }

  if (maxAttempts !== null && count >= maxAttempts) {
    return {
      allowed: false,
      remaining_attempts: 0,
      cooldown_ends_at: null,
      pass_percentage: passPct
    }
  }

  if (cooldownMinutes !== null) {
    let lastFailed: any

    if (db.backend !== 'postgres') {
      lastFailed = await db.get(
        `SELECT submitted_at, score, max_score FROM user_quiz_attempts
         WHERE user_id = ? AND module_id = ? AND max_score > 0
           AND (score * 100.0 / max_score) < ?
         ORDER BY datetime(submitted_at) DESC, id DESC
         LIMIT 1`,
        [userId, module.id, passPct]
      )
    } else {
      const kdb = getQueryDatabase(pool(db))
      const lastFailedResult = await sql<any>`
        SELECT submitted_at, score, max_score FROM user_quiz_attempts
         WHERE user_id = ${userId} AND module_id = ${module.id} AND max_score > 0
           AND (score * 100.0 / max_score) < ${passPct}
         ORDER BY submitted_at DESC, id DESC
         LIMIT 1
      `.execute(kdb)
      lastFailed = lastFailedResult.rows[0]
    }

    if (lastFailed?.submitted_at) {
      const cooldownEnds = new Date(lastFailed.submitted_at)
      cooldownEnds.setMinutes(cooldownEnds.getMinutes() + cooldownMinutes)
      if (new Date() < cooldownEnds) {
        return {
          allowed: false,
          remaining_attempts: maxAttempts !== null ? maxAttempts - count : null,
          cooldown_ends_at: cooldownEnds.toISOString(),
          pass_percentage: passPct
        }
      }
    }
  }

  return {
    allowed: true,
    remaining_attempts: maxAttempts !== null ? maxAttempts - count : null,
    cooldown_ends_at: null,
    pass_percentage: passPct
  }
}

export function createQuizAttemptRepository(db: DatabaseClient): QuizAttemptRepository {
  return {
    save: (userId, module, answers, grade) => insertModuleQuizAttempt(db, userId, module, answers, grade),
    getSummary: (userId, moduleId) => getModuleQuizSummary(db, userId, moduleId),
    checkEligibility: (userId, module) => checkAttemptEligibility(db, userId, module)
  }
}
