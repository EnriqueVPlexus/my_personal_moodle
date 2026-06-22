import assert from 'node:assert/strict'
import fs from 'node:fs'

const seed = JSON.parse(fs.readFileSync(new URL('../lib/awsRoadmapSeed.json', import.meta.url), 'utf8'))
const requiredFields = [
  'title',
  'duration',
  'objective',
  'contents',
  'importance',
  'official_resources',
  'support_videos',
  'practical_activity',
  'deliverable_evidence',
  'evaluation'
]

assert.equal(seed.title, 'Roadmap AWS gratuito para cantera junior DevOps')
assert.equal(seed.modules.length, 11)
assert.deepEqual(Object.values(seed.evaluation_weights), ['20%', '40%', '20%', '20%'])

seed.modules.forEach((module, index) => {
  assert.equal(module.position, index)
  requiredFields.forEach(field => assert.ok(module[field], `Module ${index} is missing ${field}`))
  assert.ok(Array.isArray(module.contents), `Module ${index} contents must be a list`)
  assert.ok(Array.isArray(module.official_resources), `Module ${index} official resources must be a list`)
})

console.log('AWS roadmap seed OK')
