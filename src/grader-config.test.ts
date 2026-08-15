import assert from 'node:assert/strict'
import test from 'node:test'
import { preflightEnabledGraders, resolveEnabledGraders } from './grader-config.js'
import type { ProjectConfig, SprintContract } from './types.js'

test('runtime evaluator selection replaces stale resumed-contract provider and model', () => {
  const config = fixtureConfig()
  config.runtime = {
    agentOverrides: {
      evaluator: { type: 'codex', model: 'runtime-evaluator' },
    },
  }
  const contract = {
    graders: [{
      id: 'code-review',
      type: 'code-review',
      name: 'Code Reviewer',
      enabled: true,
      agent: { type: 'claude-cli', model: 'stale-model', cwd: '/stale/repo' },
    }],
  } as SprintContract

  const graders = resolveEnabledGraders(contract, config, '/canonical/worktree')
  assert.equal(graders[0]?.agent.type, 'codex')
  assert.equal(graders[0]?.agent.model, 'runtime-evaluator')
  assert.equal(graders[0]?.agent.cwd, '/canonical/worktree')
  assert.equal(graders[0]?.agent.readOnly, true)
})

test('a model-only runtime override also pins the resolved evaluator provider', () => {
  const config = fixtureConfig()
  config.runtime = {
    agentOverrides: {
      evaluator: { type: 'codex', model: 'runtime-evaluator' },
    },
  }
  const contract = {
    graders: [{
      id: 'ux-stale',
      type: 'ux',
      name: 'Stale UX',
      enabled: true,
      agent: { type: 'claude-cli', model: 'stale-model' },
    }],
  } as SprintContract

  const [grader] = resolveEnabledGraders(contract, config, '/canonical/worktree')
  assert.equal(grader?.agent.type, 'codex')
  assert.equal(grader?.agent.model, 'runtime-evaluator')
  assert.equal(grader?.agent.readOnly, true)
})

test('grader-specific provider remains pinned when no runtime evaluator override exists', () => {
  const config = fixtureConfig()
  const contract = {
    graders: [{
      id: 'ux-specialist',
      type: 'ux',
      name: 'UX Specialist',
      enabled: true,
      agent: { type: 'claude-cli', model: 'specialist-model', workspace: '/qa', readOnly: false },
    }],
  } as SprintContract

  const graders = resolveEnabledGraders(contract, config, '/canonical/worktree')
  assert.equal(graders[0]?.agent.type, 'claude-cli')
  assert.equal(graders[0]?.agent.model, 'specialist-model')
  assert.equal(graders[0]?.agent.workspace, '/qa')
  assert.equal(graders[0]?.agent.readOnly, true)
})

test('runtime evaluator overrides never replace the independent strict reviewer', () => {
  const config = fixtureConfig()
  config.runtime = {
    agentOverrides: {
      evaluator: { type: 'codex', model: 'runtime-evaluator', reasoningEffort: 'medium' },
    },
  }
  const contract = {
    graders: [{
      id: 'independent-risk-review',
      type: 'code-review',
      name: 'Independent Risk Reviewer',
      enabled: true,
      agent: { type: 'claude-cli', model: 'claude-sonnet-4-6', reasoningEffort: 'high' },
    }],
  } as SprintContract

  const [grader] = resolveEnabledGraders(contract, config, '/canonical/worktree')
  assert.equal(grader?.agent.type, 'claude-cli')
  assert.equal(grader?.agent.model, 'claude-sonnet-4-6')
  assert.equal(grader?.agent.reasoningEffort, 'high')
  assert.equal(grader?.agent.readOnly, true)
})

test('runtime overrides cannot collapse strict review onto one provider', () => {
  const config = fixtureConfig()
  config.runtime = {
    agentOverrides: {
      evaluator: { type: 'claude-cli', model: 'claude-sonnet-4-6' },
    },
  }
  const contract = {
    graders: [
      {
        id: 'code-review',
        type: 'code-review',
        name: 'Code Reviewer',
        enabled: true,
        agent: { type: 'codex', model: 'gpt-5.6-terra' },
      },
      {
        id: 'independent-risk-review',
        type: 'code-review',
        name: 'Independent Risk Reviewer',
        enabled: true,
        agent: { type: 'claude-cli', model: 'claude-sonnet-4-6' },
      },
    ],
  } as SprintContract

  assert.throws(
    () => resolveEnabledGraders(contract, config, '/canonical/worktree'),
    /different providers/,
  )
})

test('grader preflight rejects gateway providers that cannot prove read-only execution', async () => {
  for (const type of ['openclaw', 'kilo'] as const) {
    await assert.rejects(
      preflightEnabledGraders([{
        id: `unsafe-${type}`,
        type: 'code-review',
        name: 'Unsafe reviewer',
        enabled: true,
        agent: { type, model: 'fixture', readOnly: true },
      }]),
      /cannot prove read-only execution/,
    )
  }
})

test('grader preflight fails before Dev when no grader is enabled', async () => {
  await assert.rejects(preflightEnabledGraders([]), /No enabled graders/)
})

function fixtureConfig(): ProjectConfig {
  return {
    project: { name: 'Fixture', repo: '/configured/repo' },
    priorities: { speed: 1, quality: 2, cost: 3 },
    agents: {
      generator: { type: 'codex', model: 'generator' },
      evaluator: { type: 'codex', model: 'configured-evaluator' },
    },
    qa: { defaultTier: 'targeted', maxIterations: 2, verdictMode: 'fail-closed' },
    human: {
      notificationChannel: '',
      responseTimeoutMinutes: 30,
      onTimeout: 'pause',
      costThreshold: 40,
    },
    metrics: { output: '.mah/metrics' },
    sprints: { directory: '.mah/sprints' },
  }
}
