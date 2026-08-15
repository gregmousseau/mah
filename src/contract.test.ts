import assert from 'node:assert/strict'
import test from 'node:test'
import {
  contractToDevFixPrompt,
  contractToDevPrompt,
  contractToQAPrompt,
  generateContract,
} from './contract.js'
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
  assert.equal(reviewer?.agent.readOnly, true)
})

test('review routing scales deterministic graders to task risk and user visibility', () => {
  const config: ProjectConfig = {
    project: { name: 'Fixture', repo: '.' },
    priorities: { speed: 1, quality: 2, cost: 3 },
    agents: {
      generator: { type: 'codex', model: 'gpt-5.6-terra' },
      evaluator: { type: 'codex', model: 'gpt-5.6-terra', readOnly: true },
      strictEvaluator: { type: 'claude-cli', model: 'claude-sonnet-4-6', readOnly: true },
    },
    qa: { defaultTier: 'targeted', maxIterations: 3, verdictMode: 'fail-closed' },
    review: { defaultRisk: 'adaptive', browserQa: 'user-visible', maxMaterialFindings: 3 },
    human: { notificationChannel: '', responseTimeoutMinutes: 30, onTimeout: 'pause', costThreshold: 40 },
    metrics: { output: '.mah/metrics/' },
    sprints: { directory: '.mah/sprints/' },
  }

  const routine = generateContract('Update an internal parser', config, 'routine')
  assert.equal(routine.reviewProfile?.risk, 'routine')
  assert.deepEqual(routine.graders.map(grader => grader.id), ['code-review'])

  const visible = generateContract('Update the intake form UI', config, 'visible')
  assert.equal(visible.reviewProfile?.browserQa, true)
  assert.deepEqual(visible.graders.map(grader => grader.id), ['ux-quinn', 'code-review'])

  for (const task of [
    'Add dark mode',
    'Show a toast after saving',
    'Change the navigation header',
  ]) {
    assert.equal(generateContract(task, config, task).reviewProfile?.browserQa, true)
  }

  const strict = generateContract('Fix authentication permission enforcement', config, 'strict')
  assert.equal(strict.reviewProfile?.risk, 'strict')
  assert.deepEqual(strict.graders.map(grader => grader.id), [
    'code-review',
    'independent-risk-review',
  ])

  const strictVisible = generateContract('Fix the authentication form UI', config, 'strict-visible')
  assert.equal(strictVisible.qaBrief.tier, 'full')
  assert.deepEqual(strictVisible.graders.map(grader => grader.id), [
    'ux-quinn',
    'code-review',
    'independent-risk-review',
  ])
  assert.ok(strictVisible.graders.every(grader => grader.agent.readOnly === true))
})

test('strict-risk routing fails closed without an independent evaluator', () => {
  const config: ProjectConfig = {
    project: { name: 'Fixture', repo: '.' },
    priorities: { speed: 1, quality: 2, cost: 3 },
    agents: {
      generator: { type: 'codex', model: 'gpt-5.6-terra' },
      evaluator: { type: 'codex', model: 'gpt-5.6-terra' },
    },
    qa: { defaultTier: 'targeted', maxIterations: 3, verdictMode: 'fail-closed' },
    review: { defaultRisk: 'adaptive', browserQa: 'user-visible', maxMaterialFindings: 3 },
    human: { notificationChannel: '', responseTimeoutMinutes: 30, onTimeout: 'pause', costThreshold: 40 },
    metrics: { output: '.mah/metrics/' },
    sprints: { directory: '.mah/sprints/' },
  }

  assert.throws(
    () => generateContract('Change authentication permissions', config, 'strict-missing'),
    /requires agents\.strictEvaluator/,
  )
})

test('worker prompts enforce bounded scope and concrete blockers', () => {
  const config: ProjectConfig = {
    project: { name: 'Fixture', repo: '.' },
    priorities: { speed: 1, quality: 2, cost: 3 },
    agents: {
      generator: { type: 'codex', model: 'gpt-5.6-terra' },
      evaluator: { type: 'codex', model: 'gpt-5.6-terra', readOnly: true },
    },
    qa: { defaultTier: 'targeted', maxIterations: 3, verdictMode: 'fail-closed' },
    review: { defaultRisk: 'adaptive', browserQa: 'user-visible', maxMaterialFindings: 3 },
    human: { notificationChannel: '', responseTimeoutMinutes: 30, onTimeout: 'pause', costThreshold: 40 },
    metrics: { output: '.mah/metrics/' },
    sprints: { directory: '.mah/sprints/' },
  }
  const contract = generateContract('Update the intake form UI', config, 'fixture')
  const devPrompt = contractToDevPrompt(contract)
  const qaPrompt = contractToQAPrompt(contract, 'done', 1)

  assert.match(devPrompt, /Do not add pagination, caching, retries, abstractions/)
  assert.match(devPrompt, /hypothetical concerns as non-blocking notes/i)
  assert.match(qaPrompt, /at most 3 material findings/i)
  assert.match(qaPrompt, /concrete execution path or reproduction/i)
  assert.match(qaPrompt, /Follow-up.*Observation/s)
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

test('worker handoffs prohibit recursive MAH and require parser-safe empty defect output', () => {
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
  assert.match(contractToDevPrompt(contract), /already executing inside a MAH sprint/i)
  assert.match(contractToDevPrompt(contract), /Do not launch, invoke, queue, or nest MAH/i)
  assert.match(contractToDevFixPrompt(contract, 'done', 'repair it', 2), /already executing inside a MAH sprint/i)
  assert.match(contractToDevFixPrompt(contract, 'done', 'repair it', 2), /Do not launch, invoke, queue, or nest MAH/i)
  assert.match(contractToQAPrompt(contract, 'done', 1), /If there are no defects, write exactly: None\./)
  assert.match(contractToQAPrompt(contract, 'done', 1), /Do not describe an empty defect list with a P0–P3 severity range\./)
})
