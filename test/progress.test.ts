import { describe, expect, it, vi } from 'vitest'
import { listUserRoadmapProgress } from '../lib/progress'

describe('progress helpers', () => {
  it('builds roadmap summaries with next step and completion status', async () => {
    const db = {
      all: vi.fn().mockResolvedValue([
        {
          roadmap_id: 7,
          title: 'IA para DevOps',
          description: 'Ruta aplicada',
          duration: '8 semanas',
          started_at: '2026-07-01T09:00:00.000Z',
          last_activity_at: '2026-07-06T08:30:00.000Z',
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
          roadmap_id: 8,
          title: 'AWS',
          description: 'Cloud path',
          duration: '6 meses',
          started_at: '2026-07-02T09:00:00.000Z',
          last_activity_at: '2026-07-07T10:00:00.000Z',
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
          last_activity_at: '2026-07-04T10:00:00.000Z',
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
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({
      roadmap_id: 7,
      status: 'in_progress',
      progress_percentage: 38,
      next_href: '/modules/15',
      next_step_label: 'Continuar con Evaluacion de prompts'
    })
    expect(result[1]).toMatchObject({
      roadmap_id: 8,
      status: 'completed',
      progress_percentage: 100,
      next_href: '/modules/20',
      next_step_label: 'Volver al roadmap'
    })
    expect(result[2]).toMatchObject({
      roadmap_id: 9,
      status: 'started',
      progress_percentage: 0,
      next_href: '/roadmaps/9',
      next_step_label: 'Retomar roadmap'
    })
  })
})
