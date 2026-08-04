import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadConfig, loadNamedAgents, resolveVerdictMode } from './config.js'

const configuredAgentsYaml = `
agents:
  generator: { type: codex, model: gpt-5.6-sol }
  evaluator: { type: codex, model: gpt-5.6-sol }
`

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
  assert.deepEqual(loadConfig(defaultPath).execution, {
    devIdleTimeoutMinutes: 12,
    devAbsoluteTimeoutMinutes: 45,
    transcriptMaxChars: 32_000,
  })
  assert.equal(loadConfig(legacyPath).qa.verdictMode, 'legacy')
  assert.throws(() => loadConfig(invalidPath), /verdictMode/)
})

test('execution policy is configurable and rejects unsafe timeout shapes', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-execution-config-'))
  const path = join(root, 'mah.yaml')
  const base = `
project: { name: Fixture, repo: . }
priorities: { speed: 1, quality: 2, cost: 3 }
${configuredAgentsYaml}
`
  writeFileSync(path, `${base}
execution:
  devIdleTimeoutMinutes: 10
  devAbsoluteTimeoutMinutes: 40
  transcriptMaxChars: 12000
`)
  assert.deepEqual(loadConfig(path).execution, {
    devIdleTimeoutMinutes: 10,
    devAbsoluteTimeoutMinutes: 40,
    transcriptMaxChars: 12_000,
  })

  writeFileSync(path, `${base}
execution:
  devIdleTimeoutMinutes: 20
  devAbsoluteTimeoutMinutes: 10
`)
  assert.throws(() => loadConfig(path), /greater than or equal/)

  writeFileSync(path, `${base}
execution:
  transcriptMaxChars: 999
`)
  assert.throws(() => loadConfig(path), /at least 1000/)
})

test('findings rollout modes are independently configurable and validated', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-249-config-'))
  const path = join(root, 'mah.yaml')
  writeFileSync(path, `
project: { name: Fixture, repo: . }
priorities: { speed: 1, quality: 2, cost: 3 }
${configuredAgentsYaml}
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
${configuredAgentsYaml}
findings: { scopeGate: permissive }
`)
  assert.throws(() => loadConfig(path), /findings.scopeGate/)

  for (const invalidEntry of ['../secret', '/absolute/path', '']) {
    writeFileSync(path, `
project: { name: Fixture, repo: . }
priorities: { speed: 1, quality: 2, cost: 3 }
${configuredAgentsYaml}
findings:
  currentPrPaths: [${JSON.stringify(invalidEntry)}]
`)
    assert.throws(() => loadConfig(path), /repository-relative/)
  }

  writeFileSync(path, `
project: { name: Fixture, repo: . }
priorities: { speed: 1, quality: 2, cost: 3 }
${configuredAgentsYaml}
findings: { findingsMode: ticket, ticketDispatchEnabled: true }
`)
  assert.throws(() => loadConfig(path), /ticketTeamId/)

  writeFileSync(path, `
project: { name: Fixture, repo: . }
priorities: { speed: 1, quality: 2, cost: 3 }
${configuredAgentsYaml}
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

test('missing agent configuration fails instead of selecting a silent model fallback', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-262-config-'))
  const path = join(root, 'mah.yaml')
  writeFileSync(path, `
project: { name: Fixture, repo: . }
priorities: { speed: 1, quality: 2, cost: 3 }
qa: { defaultTier: targeted, maxIterations: 2 }
`)
  assert.throws(() => loadConfig(path), /agents\.generator must be configured explicitly/)
})

test('provider and model must both be explicit even when an agent identity is configured', () => {
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
  assert.throws(() => loadConfig(path), /agents\.generator\.type must be configured explicitly/)
})

test('named-agent metadata does not invent a provider or model fallback', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-296-named-agent-config-'))
  const path = join(root, 'mah.yaml')
  writeFileSync(path, `
agents:
  dev:
    role: generator
    specialty: backend
`)
  const dev = loadNamedAgents(path).get('dev')
  assert.equal(dev?.type, undefined)
  assert.equal(dev?.model, undefined)
})

test('runtime agent overrides select a ticket worktree and model without editing mah.yaml', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-296-runtime-override-'))
  const path = join(root, 'mah.yaml')
  writeFileSync(path, `
project: { name: Fixture, repo: /configured/repo }
priorities: { speed: 1, quality: 2, cost: 3 }
agents:
  generator: { type: codex, model: configured-model, cwd: /configured/repo }
  evaluator: { type: codex, model: configured-evaluator }
`)
  const config = loadConfig(path, {
    MAH_GENERATOR_TYPE: 'codex',
    MAH_GENERATOR_MODEL: 'gpt-5.6-sol',
    MAH_GENERATOR_CWD: '/persistent/ticket-worktree',
    MAH_EVALUATOR_TYPE: 'codex',
    MAH_EVALUATOR_MODEL: 'gpt-5.6-sol',
  })
  assert.deepEqual(config.agents.generator, {
    type: 'codex',
    model: 'gpt-5.6-sol',
    cwd: '/persistent/ticket-worktree',
    workspace: undefined,
    testUrl: undefined,
    agentId: undefined,
  })
  assert.equal(config.agents.evaluator.model, 'gpt-5.6-sol')
  assert.deepEqual(config.runtime?.agentOverrides, {
    generator: {
      type: 'codex',
      model: 'gpt-5.6-sol',
      cwd: '/persistent/ticket-worktree',
    },
    evaluator: { type: 'codex', model: 'gpt-5.6-sol' },
  })
})

test('runtime overrides reject blank values and unsupported providers', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-296-runtime-override-invalid-'))
  const path = join(root, 'mah.yaml')
  writeFileSync(path, `
project: { name: Fixture, repo: . }
priorities: { speed: 1, quality: 2, cost: 3 }
agents:
  generator: { type: codex, model: configured-model }
  evaluator: { type: codex, model: configured-evaluator }
`)
  assert.throws(
    () => loadConfig(path, { MAH_GENERATOR_MODEL: '  ' }),
    /MAH_GENERATOR_MODEL must be configured explicitly/,
  )
  assert.throws(
    () => loadConfig(path, { MAH_GENERATOR_TYPE: 'invented-provider' }),
    /Unsupported agent type.*generator/,
  )
})
