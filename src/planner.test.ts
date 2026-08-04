import assert from 'node:assert/strict'
import test from 'node:test'
import { planSprint } from './planner.js'
import type { NamedAgentConfig } from './config.js'

test('planning fails instead of inventing a generator model', () => {
  assert.throws(
    () => planSprint('Implement an API endpoint', new Map(), new Map()),
    /No configured generator agent.*Add a named generator agent/s,
  )
})

test('planning uses an explicitly configured generator', () => {
  const agents = new Map<string, NamedAgentConfig>([[
    'dev',
    { role: 'generator', type: 'codex', model: 'gpt-5.6-sol' },
  ]])
  const proposal = planSprint('Implement an API endpoint', new Map(), agents)
  assert.equal(proposal.sprints[0]?.agents[0]?.agentId, 'dev')
})
