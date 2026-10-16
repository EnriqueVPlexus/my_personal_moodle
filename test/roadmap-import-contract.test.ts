import { describe, expect, it } from 'vitest'
import { buildOpenApiDocument } from '../lib/contracts/openapi'
import { roadmapImportBodyContractSchema, roadmapImportBodySchema } from '../lib/validation/import'

type Json = Record<string, any>

describe('roadmap import contract', () => {
  const document = buildOpenApiDocument() as Json
  const model = document.components.schemas.RoadmapImportDocument as Json

  it('describes the whole roadmap document in the import request', () => {
    const body = document.paths['/api/roadmaps/import'].post.requestBody.content['application/json'].schema as Json
    expect(body.properties.roadmap.$ref).toBe('#/components/schemas/RoadmapImportDocument')
    expect(model.required).toEqual(['title', 'modules'])
    expect(model.properties.modules).toMatchObject({ minItems: 1, maxItems: 100 })
    expect(model.properties.title).toMatchObject({ minLength: 1, maxLength: 200 })
    expect(model.properties.topics.maxItems).toBe(20)
  })

  it('describes levels, links and the quiz question types', () => {
    const moduleItem = model.properties.modules.items as Json
    expect(moduleItem.properties.level.enum).toEqual(['beginner', 'intermediate', 'advanced', 'capstone', null])
    expect(moduleItem.properties.official_resources.items.required).toEqual(['label'])
    const variants = moduleItem.properties.quiz.items.oneOf as Json[]
    expect(variants.map(variant => variant.properties.type.const)).toEqual(['multiple_choice', 'true_false', 'code_snippet'])
    expect(variants[0].properties.options).toMatchObject({ minItems: 2, maxItems: 6 })
  })

  it('keeps the runtime envelope lenient so document errors come back as `issues`', () => {
    const invalidDocument = { title: '', modules: [] }
    expect(roadmapImportBodySchema.safeParse({ action: 'preview', roadmap: invalidDocument }).success).toBe(true)
    expect(roadmapImportBodyContractSchema.safeParse({ action: 'preview', roadmap: invalidDocument }).success).toBe(false)
  })
})
