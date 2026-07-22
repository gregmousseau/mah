import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadConfig } from './config.js'

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
  assert.equal(loadConfig(legacyPath).qa.verdictMode, 'legacy')
  assert.throws(() => loadConfig(invalidPath), /verdictMode/)
})
