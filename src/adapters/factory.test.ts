import assert from 'node:assert/strict'
import test from 'node:test'
import { createAgentAdapter } from './factory.js'
import type { AgentConfig } from '../types.js'

function config(type: AgentConfig['type'], model = 'fixture'): AgentConfig {
  return { type, model }
}

test('provider selection honors codex, kilo, and explicit Claude configuration', () => {
  assert.equal(createAgentAdapter(config('codex')).provider, 'codex')
  assert.equal(createAgentAdapter(config('kilo')).provider, 'kilo')
  assert.equal(createAgentAdapter(config('claude-cli')).provider, 'claude-cli')
  assert.equal(createAgentAdapter(config('openclaw')).provider, 'openclaw')
})

test('custom providers fail closed instead of silently using Claude or a mock', () => {
  assert.throws(() => createAgentAdapter(config('custom')), /No execution adapter/)
})
