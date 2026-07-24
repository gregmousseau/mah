import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadConfig, resolveVerdictMode } from './config.js'

test('verdict mode defaults fail closed and supports an explicit legacy rollback', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-248-config-'))
  const base = `
project:
  name: Fixture
  repo: .
priorities:
  speed: 1
  quality: 2
  cost: 3
agents:
  generator: { type: openclaw, model: fixture }
  evaluator: { type: openclaw, model: fixture }
qa:
  defaultTier: targeted
  maxIterations: 2
`
  const defaultPath = join(root, 'default.yaml')
  const legacyPath = join(root, 'legacy.yaml')
  const invalidPath = join(root, 'invalid.yaml')
  writeFileSync(defaultPath, base)
  writeFileSync(legacyPath, `${base}  verdictMode: legacy\n`)
  writeFileSync(invalidPath, `${base}  verdictMode: permissive\n`)

  assert.equal(loadConfig(defaultPath).qa.verdictMode, 'fail-closed')
  assert.deepEqual(loadConfig(defaultPath).findings, {
    scopeGate: 'advisory',
    findingsMode: 'report',
    ticketDispatchEnabled: false,
    currentPrPaths: [],
    falsePositiveIds: [],
  })
  assert.equal(loadConfig(legacyPath).qa.verdictMode, 'legacy')
  assert.throws(() => loadConfig(invalidPath), /verdictMode/)
})

test('findings rollout modes are independently configurable and validated', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-249-config-'))
  const path = join(root, 'mah.yaml')
  writeFileSync(path, `
project: { name: Fixture, repo: . }
priorities: { speed: 1, quality: 2, cost: 3 }
findings:
  scopeGate: enforced
  findingsMode: off
  ticketDispatchEnabled: false
  currentPrPaths: [src/pipeline.ts]
`)
  const config = loadConfig(path)
  assert.equal(config.findings?.scopeGate, 'enforced')
  assert.equal(config.findings?.findingsMode, 'off')
  assert.equal(config.findings?.ticketDispatchEnabled, false)
  assert.deepEqual(config.findings?.currentPrPaths, ['src/pipeline.ts'])

  writeFileSync(path, `
project: { name: Fixture, repo: . }
priorities: { speed: 1, quality: 2, cost: 3 }
findings: { scopeGate: permissive }
`)
  assert.throws(() => loadConfig(path), /findings.scopeGate/)

  for (const invalidEntry of ['../secret', '/absolute/path', '']) {
    writeFileSync(path, `
project: { name: Fixture, repo: . }
priorities: { speed: 1, quality: 2, cost: 3 }
findings:
  currentPrPaths: [${JSON.stringify(invalidEntry)}]
`)
    assert.throws(() => loadConfig(path), /repository-relative/)
  }

  writeFileSync(path, `
project: { name: Fixture, repo: . }
priorities: { speed: 1, quality: 2, cost: 3 }
findings: { findingsMode: ticket, ticketDispatchEnabled: true }
`)
  assert.throws(() => loadConfig(path), /ticketTeamId/)

  writeFileSync(path, `
project: { name: Fixture, repo: . }
priorities: { speed: 1, quality: 2, cost: 3 }
findings:
  scopeGate: enforced
  findingsMode: report
  ticketDispatchEnabled: true
  falsePositiveIds: [QA-FP-1]
`)
  const reportOnly = loadConfig(path)
  assert.equal(reportOnly.findings?.findingsMode, 'report')
  assert.equal(reportOnly.findings?.ticketTeamId, undefined)
  assert.deepEqual(reportOnly.findings?.falsePositiveIds, ['QA-FP-1'])
})

test('direct config entry points honor the verdict mode environment override', () => {
  assert.equal(resolveVerdictMode('fail-closed', 'legacy'), 'legacy')
  assert.equal(resolveVerdictMode(undefined, undefined), 'fail-closed')
  assert.throws(() => resolveVerdictMode('fail-closed', 'permissive'), /verdictMode/)
})

test('missing agent configuration defaults to Codex rather than Claude', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-262-config-'))
  const path = join(root, 'mah.yaml')
  writeFileSync(path, `
project: { name: Fixture, repo: . }
priorities: { speed: 1, quality: 2, cost: 3 }
qa: { defaultTier: targeted, maxIterations: 2 }
`)
  const config = loadConfig(path)
  assert.deepEqual(
    { type: config.agents.generator.type, model: config.agents.generator.model },
    { type: 'codex', model: 'gpt-5.6-sol' },
  )
  assert.deepEqual(
    { type: config.agents.evaluator.type, model: config.agents.evaluator.model },
    { type: 'codex', model: 'gpt-5.6-sol' },
  )
})

test('Codex defaults do not inherit Claude-only models from named-agent metadata', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-262-agent-config-'))
  const path = join(root, 'mah.yaml')
  writeFileSync(path, `
project: { name: Fixture, repo: . }
priorities: { speed: 1, quality: 2, cost: 3 }
agents:
  generator: { agentId: awc }
  evaluator: { agentId: qa }
qa: { defaultTier: targeted, maxIterations: 2 }
`)
  const config = loadConfig(path)
  assert.deepEqual(
    { type: config.agents.generator.type, model: config.agents.generator.model },
    { type: 'codex', model: 'gpt-5.6-sol' },
  )
})
