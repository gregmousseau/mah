import assert from 'node:assert/strict'
import test from 'node:test'
import { contractToDevFixPrompt, generateContract } from './contract.js'
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

test('repair prompts bound oversized carried transcripts while preserving useful edges', () => {
  const config: ProjectConfig = {
    project: { name: 'Fixture', repo: '.' },
    priorities: { speed: 1, quality: 2, cost: 3 },
    agents: {
      generator: { type: 'codex', model: 'gpt-5.6-sol' },
      evaluator: { type: 'codex', model: 'gpt-5.6-sol' },
    },
    qa: { defaultTier: 'targeted', maxIterations: 2, verdictMode: 'fail-closed' },
    human: { notificationChannel: '', responseTimeoutMinutes: 30, onTimeout: 'pause', costThreshold: 40 },
    metrics: { output: '.mah/metrics/' },
    sprints: { directory: '.mah/sprints/' },
  }
  const contract = generateContract('Fixture task', config, 'fixture')
  const oversizedDevOutput = `DEV-START\n${'d'.repeat(100_000)}\nDEV-END`
  const oversizedQAReport = `QA-START\n${'q'.repeat(100_000)}\nQA-END`

  const prompt = contractToDevFixPrompt(
    contract,
    oversizedDevOutput,
    oversizedQAReport,
    2,
  )

  assert.ok(prompt.length < 140_000)
  assert.match(prompt, /DEV-START/)
  assert.match(prompt, /DEV-END/)
  assert.match(prompt, /QA-START/)
  assert.match(prompt, /QA-END/)
  assert.match(prompt, /MAH truncated previous implementation/)
  assert.match(prompt, /MAH truncated QA report/)
})
