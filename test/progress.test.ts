import { describe, expect, it, vi } from 'vitest'
import { getRoadmapDetailProgress, listUserRoadmapProgress } from '../lib/progress'

describe('progress helpers', () => {
  it('builds roadmap summaries with next step and completion status', async () => {
    const recentActivity = new Date().toISOString()
    const pausedActivity = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
    const db = {
      all: vi.fn().mockResolvedValue([
        {
          roadmap_id: 7,
          title: 'IA para DevOps',
          description: 'Ruta aplicada',
          duration: '8 semanas',
          started_at: '2026-07-01T09:00:00.000Z',
          last_activity_at: recentActivity,
          completed_at: null,
          completed_lessons_count: 3,
          time_spent_seconds: 4500,
          current_module_id: 15,
          current_module_title: 'Observabilidad',
          current_lesson_id: 42,
          current_lesson_title: 'Evaluacion de prompts',
          total_modules: 5,
          total_lessons: 8
        },
        {
          roadmap_id: 10,
          title: 'Kubernetes',
          description: 'Cluster path',
          duration: '4 semanas',
          started_at: pausedActivity,
          last_activity_at: pausedActivity,
          completed_at: null,
          completed_lessons_count: 1,
          time_spent_seconds: 600,
          current_module_id: 30,
          current_module_title: 'Pods',
          current_lesson_id: null,
          current_lesson_title: null,
          total_modules: 2,
          total_lessons: 6,
          quiz_attempts_count: 2,
          average_quiz_percentage: 67.4,
          best_quiz_percentage: 80,
          last_quiz_percentage: 60
        },
        {
          roadmap_id: 8,
          title: 'AWS',
          description: 'Cloud path',
          duration: '6 meses',
          started_at: '2026-07-02T09:00:00.000Z',
          last_activity_at: recentActivity,
          completed_at: '2026-07-07T10:00:00.000Z',
          completed_lessons_count: 4,
          time_spent_seconds: 7200,
          current_module_id: 20,
          current_module_title: 'EC2',
          current_lesson_id: 80,
          current_lesson_title: 'Cierre',
          total_modules: 2,
          total_lessons: 4
        },
        {
          roadmap_id: 9,
          title: 'Linux',
          description: null,
          duration: null,
          started_at: '2026-07-03T09:00:00.000Z',
          last_activity_at: pausedActivity,
          completed_at: null,
          completed_lessons_count: 0,
          time_spent_seconds: 0,
          current_module_id: null,
          current_module_title: null,
          current_lesson_id: null,
          current_lesson_title: null,
          total_modules: 3,
          total_lessons: 6
        }
      ])
    }

    const result = await listUserRoadmapProgress(db as any, 2)

    expect(db.all).toHaveBeenCalledOnce()
    expect(result).toHaveLength(4)
    expect(result[0]).toMatchObject({
      roadmap_id: 7,
      status: 'in_progress',
      progress_percentage: 38,
      next_href: '/modules/15',
      next_step_label: 'Continuar con Evaluacion de prompts',
      quiz_attempts_count: 0
    })
    expect(result[1]).toMatchObject({
      roadmap_id: 10,
      status: 'paused',
      progress_percentage: 17,
      next_href: '/modules/30',
      next_step_label: 'Continuar con Pods',
      quiz_attempts_count: 2,
      average_quiz_percentage: 67,
      best_quiz_percentage: 80,
      last_quiz_percentage: 60
    })
    expect(result[2]).toMatchObject({
      roadmap_id: 8,
      status: 'completed',
      progress_percentage: 100,
      next_href: '/modules/20',
      next_step_label: 'Volver al roadmap'
    })
    expect(result[3]).toMatchObject({
      roadmap_id: 9,
      status: 'started',
      progress_percentage: 0,
      next_href: '/roadmaps/9',
      next_step_label: 'Retomar roadmap'
    })
  })

  it('builds detailed roadmap progress grouped by module', async () => {
    const db = {
      get: vi.fn().mockResolvedValue({
        roadmap_id: 7,
        started_at: '2026-07-01T09:00:00.000Z',
        last_activity_at: '2026-07-06T08:30:00.000Z',
        completed_at: null,
        current_module_id: 15,
        current_module_title: 'Observabilidad',
        current_lesson_id: 42,
        current_lesson_title: 'Evaluacion de prompts'
      }),
      all: vi.fn()
        .mockResolvedValueOnce([
          {
            module_id: 15,
            title: 'Observabilidad',
            position: 1,
            total_lessons: 2,
            completed_lessons_count: 1,
            last_activity_at: '2026-07-06T08:30:00.000Z'
          },
          {
            module_id: 16,
            title: 'CI/CD',
            position: 2,
            total_lessons: 1,
            completed_lessons_count: 0,
            last_activity_at: null
          }
        ])
        .mockResolvedValueOnce([
          {
            lesson_id: 42,
            lesson_title: 'Evaluacion de prompts',
            module_id: 15,
            completed: 1,
            time_spent_seconds: 1200
          },
          {
            lesson_id: 43,
            lesson_title: 'Alertas',
            module_id: 15,
            completed: 0,
            time_spent_seconds: 0
          },
          {
            lesson_id: 44,
            lesson_title: 'Pipeline',
            module_id: 16,
            completed: 0,
            time_spent_seconds: 0
          }
        ])
    }

    const result = await getRoadmapDetailProgress(db as any, 2, 7)

    expect(result).toMatchObject({
      roadmap_id: 7,
      completed_lessons_count: 1,
      total_lessons: 3,
      progress_percentage: 33,
      status: 'in_progress',
      next_href: '/modules/15',
      next_step_label: 'Continuar con Alertas',
      time_spent_seconds: 1200
    })
    expect(result.modules).toEqual([
      expect.objectContaining({
        module_id: 15,
        status: 'in_progress',
        progress_percentage: 50,
        next_lesson_title: 'Alertas'
      }),
      expect.objectContaining({
        module_id: 16,
        status: 'not_started',
        progress_percentage: 0,
        next_lesson_title: 'Pipeline'
      })
    ])
  })
})
