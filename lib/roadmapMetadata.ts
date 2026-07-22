export const MODULE_LEVELS = ['beginner', 'intermediate', 'advanced', 'capstone'] as const

export type ModuleLevel = typeof MODULE_LEVELS[number]

export type DurationRange = {
  min: number | null
  max: number | null
}

export function normalizeMetadataKey(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeModuleLevel(value: unknown): ModuleLevel | null {
  const normalized = String(value ?? '').trim().toLocaleLowerCase('en')
  if (normalized === 'beginner-intermediate') return 'intermediate'
  if (normalized === 'intermediate-advanced') return 'advanced'
  return MODULE_LEVELS.includes(normalized as ModuleLevel) ? normalized as ModuleLevel : null
}

export function parseDurationWeeks(value: unknown): DurationRange {
  const normalized = String(value ?? '').toLocaleLowerCase('es').replace(/,/g, '.')
  const range = normalized.match(/(\d+(?:\.\d+)?)\s*(?:-|–|a|o)\s*(\d+(?:\.\d+)?)\s*seman/)
  if (range) {
    const first = Number(range[1])
    const second = Number(range[2])
    return { min: Math.min(first, second), max: Math.max(first, second) }
  }

  const weeks = normalized.match(/(\d+(?:\.\d+)?)\s*seman/)
  if (weeks) return { min: Number(weeks[1]), max: Number(weeks[1]) }

  const months = normalized.match(/(\d+(?:\.\d+)?)\s*mes/)
  if (months) {
    const estimatedWeeks = Number(months[1]) * 4
    return { min: estimatedWeeks, max: estimatedWeeks }
  }

  return { min: null, max: null }
}

export function normalizeDurationRange(minValue: unknown, maxValue: unknown): DurationRange | null {
  const min = minValue === '' || minValue === null || minValue === undefined ? null : Number(minValue)
  const max = maxValue === '' || maxValue === null || maxValue === undefined ? null : Number(maxValue)
  if ((min !== null && (!Number.isFinite(min) || min < 0)) ||
      (max !== null && (!Number.isFinite(max) || max < 0)) ||
      (min !== null && max !== null && min > max)) return null
  return { min, max }
}

export function normalizeTopics(value: unknown): string[] {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',')
  const unique = new Map<string, string>()
  values.forEach(item => {
    const label = String(item).trim().replace(/\s+/g, ' ')
    const key = normalizeMetadataKey(label)
    if (key && !unique.has(key)) unique.set(key, label)
  })
  return [...unique.values()]
}

export async function saveRoadmapMetadata(
  db: any,
  roadmapId: number | string,
  categoryValue: unknown,
  topicsValue: unknown
) {
  const categoryLabel = String(categoryValue ?? '').trim().replace(/\s+/g, ' ')
  const categoryKey = normalizeMetadataKey(categoryLabel)
  let categoryId: number | null = null

  if (categoryKey) {
    await db.run(
      `INSERT INTO roadmap_categories (key, label) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET label = excluded.label`,
      [categoryKey, categoryLabel]
    )
    categoryId = (await db.get('SELECT id FROM roadmap_categories WHERE key = ?', [categoryKey])).id
  }

  await db.run('UPDATE roadmaps SET category_id = ? WHERE id = ?', [categoryId, roadmapId])
  await db.run('DELETE FROM roadmap_topics WHERE roadmap_id = ?', [roadmapId])

  for (const topicLabel of normalizeTopics(topicsValue)) {
    const topicKey = normalizeMetadataKey(topicLabel)
    await db.run(
      `INSERT INTO topics (key, label) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET label = excluded.label`,
      [topicKey, topicLabel]
    )
    const topic = await db.get('SELECT id FROM topics WHERE key = ?', [topicKey])
    await db.run(
      'INSERT OR IGNORE INTO roadmap_topics (roadmap_id, topic_id) VALUES (?, ?)',
      [roadmapId, topic.id]
    )
  }
}

export async function getRoadmapTopics(db: any, roadmapId: number | string) {
  return db.all(
    `SELECT topics.key, topics.label
     FROM topics
     INNER JOIN roadmap_topics ON roadmap_topics.topic_id = topics.id
     WHERE roadmap_topics.roadmap_id = ?
     ORDER BY topics.label COLLATE NOCASE, topics.key`,
    [roadmapId]
  )
}
