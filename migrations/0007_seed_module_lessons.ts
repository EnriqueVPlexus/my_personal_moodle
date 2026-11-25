import { Kysely } from 'kysely'

/**
 * Populates missing `lessons` rows for seeded catalog modules (AWS, IA SRE/DevOps,
 * DevOps Junior) using each module's `contents` / `practical_activity` topics.
 *
 * Self-contained on purpose (production images ship `migrations/` without `lib/`).
 *
 * Safe & idempotent:
 *  - No-op on empty databases (`roadmaps` count === 0).
 *  - Only targets modules belonging to the built-in seeded roadmaps.
 *  - Leaves modules that already have 1 or more lessons untouched, preserving
 *    all learner progress (`user_lesson_progress`) and admin customisations.
 */
const SEEDED_ROADMAP_TITLES = [
  'Roadmap AWS para cantera junior DevOps',
  'Roadmap AWS gratuito para cantera junior DevOps',
  'Roadmap IA para SRE/DevOps - Versión 2.0',
  'Roadmap desde 0 a DevOps Junior'
]

function parseStringList(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map(item => String(item ?? '').trim()).filter(Boolean)
  }
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map(item => String(item ?? '').trim()).filter(Boolean)
      }
      if (typeof parsed === 'string' && parsed.trim()) {
        return [parsed.trim()]
      }
    } catch {
      return [trimmed]
    }
  }
  return []
}

function deriveLessonTitles(
  contentsInput: unknown,
  practicalActivityInput: unknown,
  moduleTitle: string
): string[] {
  const contents = parseStringList(contentsInput)
  if (contents.length > 0) return contents

  const practicalActivities = parseStringList(practicalActivityInput)
  if (practicalActivities.length > 0) return practicalActivities

  const cleanTitle = moduleTitle.trim()
  return cleanTitle ? [`Estudio y práctica: ${cleanTitle}`] : []
}

export async function up(db: Kysely<any>): Promise<void> {
  const { count } = await db
    .selectFrom('roadmaps')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .executeTakeFirstOrThrow()
  if (Number(count) === 0) return

  const seededRoadmaps = await db
    .selectFrom('roadmaps')
    .select(['id'])
    .where('title', 'in', SEEDED_ROADMAP_TITLES)
    .execute()

  if (seededRoadmaps.length === 0) return
  const roadmapIds = seededRoadmaps.map((row) => row.id)

  const modules: Array<{
    id: number
    title: string
    contents: string | null
    practical_activity: string | null
  }> = await db
    .selectFrom('modules')
    .select(['id', 'title', 'contents', 'practical_activity'])
    .where('roadmap_id', 'in', roadmapIds)
    .orderBy('id', 'asc')
    .execute()

  for (const mod of modules) {
    const lessonCount = await db
      .selectFrom('lessons')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('module_id', '=', mod.id)
      .executeTakeFirstOrThrow()

    if (Number(lessonCount.count) > 0) continue

    const lessonTitles = deriveLessonTitles(mod.contents, mod.practical_activity, mod.title)
    if (lessonTitles.length === 0) continue

    await db
      .insertInto('lessons')
      .values(
        lessonTitles.map((title) => ({
          module_id: mod.id,
          title,
          completed: 0
        }))
      )
      .execute()
  }
}

export async function down(_db: Kysely<any>): Promise<void> {
  // No-op: removing lessons destructively would erase user_lesson_progress history.
}

