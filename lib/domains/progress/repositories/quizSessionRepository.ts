import type { DatabaseClient } from '../../../persistence/database'
import type { PostgresDb } from '../../../persistence/postgresDb'
import { getQueryDatabase } from '../../../persistence/kyselyDatabase'
import type { ModuleQuizQuestion } from '../../content/quizzes'
import type { QuizAttemptSession, QuizSessionRepository } from '../ports'

function pool(db: DatabaseClient) {
  return (db as PostgresDb).getPool()
}

/** Postgres returns Date objects for TIMESTAMPTZ; SQLite returns the ISO text we stored. */
function toIso(value: unknown): string {
  return new Date(value as string | Date).toISOString()
}

function toSession(row: any): QuizAttemptSession {
  return {
    id: row.id,
    user_id: Number(row.user_id),
    module_id: Number(row.module_id),
    questions: JSON.parse(row.questions) as ModuleQuizQuestion[],
    created_at: toIso(row.created_at),
    expires_at: toIso(row.expires_at),
    submitted_at: row.submitted_at ? toIso(row.submitted_at) : null
  }
}

export async function findActiveQuizSession(
  db: DatabaseClient,
  userId: number,
  moduleId: number,
  now: string
): Promise<QuizAttemptSession | null> {
  let row: any

  if (db.backend !== 'postgres') {
    // ISO-8601 UTC strings compare chronologically as text.
    row = await db.get(
      `SELECT * FROM quiz_attempt_sessions
       WHERE user_id = ? AND module_id = ? AND submitted_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [userId, moduleId, now]
    )
  } else {
    row = await getQueryDatabase(pool(db))
      .selectFrom('quiz_attempt_sessions')
      .selectAll()
      .where('user_id', '=', userId)
      .where('module_id', '=', moduleId)
      .where('submitted_at', 'is', null)
      .where('expires_at', '>', now)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(1)
      .executeTakeFirst()
  }

  return row ? toSession(row) : null
}

export async function findQuizSessionById(db: DatabaseClient, id: string): Promise<QuizAttemptSession | null> {
  let row: any

  if (db.backend !== 'postgres') {
    row = await db.get('SELECT * FROM quiz_attempt_sessions WHERE id = ?', [id])
  } else {
    row = await getQueryDatabase(pool(db))
      .selectFrom('quiz_attempt_sessions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
  }

  return row ? toSession(row) : null
}

export async function createQuizSession(
  db: DatabaseClient,
  session: { id: string; userId: number; moduleId: number; questions: ModuleQuizQuestion[]; createdAt: string; expiresAt: string }
): Promise<QuizAttemptSession> {
  const questions = JSON.stringify(session.questions)

  if (db.backend !== 'postgres') {
    await db.run(
      `INSERT INTO quiz_attempt_sessions (id, user_id, module_id, questions, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [session.id, session.userId, session.moduleId, questions, session.createdAt, session.expiresAt]
    )
  } else {
    await getQueryDatabase(pool(db))
      .insertInto('quiz_attempt_sessions')
      .values({
        id: session.id,
        user_id: session.userId,
        module_id: session.moduleId,
        questions,
        created_at: session.createdAt,
        expires_at: session.expiresAt,
        submitted_at: null
      })
      .execute()
  }

  return {
    id: session.id,
    user_id: session.userId,
    module_id: session.moduleId,
    questions: session.questions,
    created_at: session.createdAt,
    expires_at: session.expiresAt,
    submitted_at: null
  }
}

/** `UPDATE ... WHERE submitted_at IS NULL`: only one of several concurrent submits wins. */
export async function markQuizSessionSubmitted(db: DatabaseClient, id: string, submittedAt: string): Promise<boolean> {
  if (db.backend !== 'postgres') {
    const result = await db.run(
      'UPDATE quiz_attempt_sessions SET submitted_at = ? WHERE id = ? AND submitted_at IS NULL',
      [submittedAt, id]
    )
    return Number(result.changes ?? 0) > 0
  }

  const result = await getQueryDatabase(pool(db))
    .updateTable('quiz_attempt_sessions')
    .set({ submitted_at: submittedAt })
    .where('id', '=', id)
    .where('submitted_at', 'is', null)
    .executeTakeFirst()
  return Number(result.numUpdatedRows ?? 0) > 0
}

export function createQuizSessionRepository(db: DatabaseClient): QuizSessionRepository {
  return {
    findActive: (userId, moduleId, now) => findActiveQuizSession(db, userId, moduleId, now),
    create: session => createQuizSession(db, session),
    findById: id => findQuizSessionById(db, id),
    markSubmitted: (id, submittedAt) => markQuizSessionSubmitted(db, id, submittedAt)
  }
}
