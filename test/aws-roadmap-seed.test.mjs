import assert from 'node:assert/strict'
import fs from 'node:fs'

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

const seedCases = [
  {
    file: '../lib/awsRoadmapSeed.json',
    title: 'Roadmap AWS gratuito para cantera junior DevOps',
    moduleCount: 11,
    weights: ['20%', '40%', '20%', '20%']
  },
  {
    file: '../lib/iaDevopsRoadmapSeed.json',
    title: 'IA para DevOps',
    moduleCount: 11,
    duration: '6 meses (5-8 h/semana)',
    weights: ['30%', '35%', '15%', '20%']
  }
]

seedCases.forEach(seedCase => {
  const seed = JSON.parse(fs.readFileSync(new URL(seedCase.file, import.meta.url), 'utf8'))

  assert.equal(seed.title, seedCase.title)
  assert.equal(seed.modules.length, seedCase.moduleCount)
  assert.deepEqual(Object.values(seed.evaluation_weights), seedCase.weights)
  if (seedCase.duration) assert.equal(seed.duration, seedCase.duration)

  seed.modules.forEach((module, index) => {
    assert.equal(module.position, index)
    requiredFields.forEach(field => assert.ok(module[field], `${seed.title} module ${index} is missing ${field}`))
    assert.ok(Array.isArray(module.contents), `${seed.title} module ${index} contents must be a list`)
    assert.ok(Array.isArray(module.official_resources), `${seed.title} module ${index} official resources must be a list`)
    assert.ok(Array.isArray(module.support_videos), `${seed.title} module ${index} support videos must be a list`)
    assert.ok(Array.isArray(module.practical_activity), `${seed.title} module ${index} practical activity must be a list`)
    assert.ok(Array.isArray(module.deliverable_evidence), `${seed.title} module ${index} deliverables must be a list`)
  })
})

console.log('Roadmap seeds OK')
