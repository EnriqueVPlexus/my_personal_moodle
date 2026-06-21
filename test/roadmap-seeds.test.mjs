import assert from 'node:assert/strict'
import fs from 'node:fs'

const awsSeed = JSON.parse(fs.readFileSync(new URL('../lib/awsRoadmapSeed.json', import.meta.url), 'utf8'))
const devopsSeed = JSON.parse(fs.readFileSync(new URL('../lib/devopsRoadmapSeed.json', import.meta.url), 'utf8'))
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

function assertRoadmapSeed(seed, expected) {
  assert.equal(seed.title, expected.title)
  assert.equal(seed.modules.length, expected.moduleCount)
  assert.deepEqual(Object.values(seed.evaluation_weights), expected.evaluationWeights)

  seed.modules.forEach((module, index) => {
    assert.equal(module.position, index)
    requiredFields.forEach(field => assert.ok(module[field], `${seed.title} module ${index} is missing ${field}`))
    assert.ok(Array.isArray(module.contents), `${seed.title} module ${index} contents must be a list`)
    assert.ok(Array.isArray(module.official_resources), `${seed.title} module ${index} official resources must be a list`)
    assert.ok(Array.isArray(module.support_videos), `${seed.title} module ${index} support videos must be a list`)
    assert.ok(Array.isArray(module.practical_activity), `${seed.title} module ${index} practical activity must be a list`)
    assert.ok(Array.isArray(module.deliverable_evidence), `${seed.title} module ${index} evidence must be a list`)
  })
}

assertRoadmapSeed(awsSeed, {
  title: 'Roadmap AWS gratuito para cantera junior DevOps',
  moduleCount: 11,
  evaluationWeights: ['20%', '40%', '20%', '20%']
})

assertRoadmapSeed(devopsSeed, {
  title: 'Roadmap desde 0 a DevOps Junior',
  moduleCount: 12,
  evaluationWeights: ['45%', '25%', '20%', '10%']
})

console.log('Roadmap seeds OK')
