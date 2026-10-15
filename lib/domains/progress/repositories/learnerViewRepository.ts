import type { DatabaseClient } from '../../../persistence/database'
import { toBoolean } from '../../../persistence/normalize'
import { publicModuleColumnsSql } from '../../content/publicModule'
import type { LearnerViewRepository } from '../ports'

/**
 * Read models that join catalog rows with the learner's own progress and
 * evidence. Plain SQL shared by SQLite and PostgreSQL (PostgresDb translates
 * placeholders), moved out of the module/roadmap detail handlers.
 */
export function createLearnerViewRepository(db: DatabaseClient): LearnerViewRepository {
  return {
    async listRoadmapModules(roadmapId, userId) {
      if (userId !== null) {
        const rows = await db.all(
          `SELECT ${publicModuleColumnsSql('modules')},
                  EXISTS (
                    SELECT 1 FROM user_module_evidences
                    WHERE user_module_evidences.module_id = modules.id
                      AND user_module_evidences.user_id = ?
                  ) AS has_evidence
           FROM modules
           WHERE modules.roadmap_id = ?
           ORDER BY COALESCE(modules.position, modules.id), modules.id`,
          [userId, roadmapId]
        )
        // 0/1 on SQLite, boolean on PostgreSQL: always a boolean.
        return rows.map(row => ({ ...row, has_evidence: toBoolean(row.has_evidence) }))
      }

      return db.all(
        `SELECT ${publicModuleColumnsSql()} FROM modules WHERE roadmap_id = ? ORDER BY COALESCE(position, id), id`,
        [roadmapId]
      )
    },

    listModuleLessons(moduleId, userId) {
      if (userId !== null) {
        return db.all(
          `SELECT lessons.*,
                  CASE WHEN user_lesson_progress.completed_at IS NOT NULL THEN 1 ELSE 0 END AS completed,
                  user_lesson_progress.started_at AS progress_started_at,
                  user_lesson_progress.last_activity_at AS progress_last_activity_at,
                  user_lesson_progress.completed_at AS progress_completed_at,
                  COALESCE(user_lesson_progress.time_spent_seconds, 0) AS progress_time_spent_seconds
           FROM lessons
           LEFT JOIN user_lesson_progress
             ON user_lesson_progress.lesson_id = lessons.id
            AND user_lesson_progress.user_id = ?
           WHERE lessons.module_id = ?
           ORDER BY lessons.id`,
          [userId, moduleId]
        )
      }

      return db.all('SELECT * FROM lessons WHERE module_id = ? ORDER BY id', [moduleId])
    }
  }
}
