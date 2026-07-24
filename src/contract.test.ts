import assert from 'node:assert/strict'
import test from 'node:test'
import { generateContract } from './contract.js'
import type { ProjectConfig } from './types.js'

test('default code review uses the configured evaluator provider', () => {
  const config: ProjectConfig = {
    project: { name: 'Fixture', repo: '.' },
    priorities: { speed: 1, quality: 2, cost: 3 },
    agents: {
      generator: { type: 'codex', model: 'gpt-5.6-sol' },
      evaluator: { type: 'kilo', model: 'subscription-default' },
    },
    qa: { defaultTier: 'targeted', maxIterations: 2, verdictMode: 'fail-closed' },
    human: { notificationChannel: '', responseTimeoutMinutes: 30, onTimeout: 'pause', costThreshold: 40 },
    metrics: { output: '.mah/metrics/' },
    sprints: { directory: '.mah/sprints/' },
  }
  const contract = generateContract('Fixture task', config, 'fixture')
  const reviewer = contract.graders.find(grader => grader.type === 'code-review')
  assert.equal(reviewer?.agent.type, 'kilo')
  assert.equal(reviewer?.agent.model, 'subscription-default')
})
