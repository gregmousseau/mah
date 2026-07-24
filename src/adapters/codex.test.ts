import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { CodexAdapter } from './codex.js'

test('Codex adapter uses activity-reset idle timeout, absolute ceiling, and bounded transcripts', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'mah-codex-adapter-test-'))
  const bin = join(root, 'bin')
  const rawDir = join(root, 'raw')
  const originalPath = process.env.PATH
  const originalBehavior = process.env.MAH_TEST_CODEX_BEHAVIOR
  try {
    const { mkdirSync } = await import('node:fs')
    mkdirSync(bin)
    mkdirSync(rawDir)
    const executable = join(bin, 'codex')
    writeFileSync(executable, `#!/usr/bin/env bash
set -eu
output=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output-last-message" ]]; then
    output="$2"
    shift 2
  else
    shift
  fi
done
cat >/dev/null
case "\${MAH_TEST_CODEX_BEHAVIOR:-active}" in
  active)
    for _ in 1 2 3 4 5 6; do
      printf 'active-tick\\n'
      sleep 0.03
    done
    printf 'active completion' > "$output"
    ;;
  idle)
    sleep 2
    ;;
  absolute)
    while true; do
      printf 'absolute-tick\\n'
      sleep 0.02
    done
    ;;
  large)
    printf 'HEAD:'
    head -c 5000 /dev/zero | tr '\\0' x
    printf ':TAIL'
    {
      printf 'HEAD:'
      head -c 5000 /dev/zero | tr '\\0' x
      printf ':TAIL'
    } > "$output"
    ;;
esac
`)
    chmodSync(executable, 0o755)
    process.env.PATH = `${bin}:${originalPath ?? ''}`
    const adapter = new CodexAdapter()

    await t.test('active output can run beyond the idle duration', async () => {
      process.env.MAH_TEST_CODEX_BEHAVIOR = 'active'
      const rawActivityPath = join(rawDir, 'active.log')
      const result = await adapter.execute('test', {
        model: 'test-model',
        cwd: root,
        idleTimeoutMs: 50,
        absoluteTimeoutMs: 500,
        rawActivityPath,
      })
      assert.equal(result.success, true)
      assert.equal(result.termination?.reason, 'completed')
      assert.match(readFileSync(rawActivityPath, 'utf8'), /active-tick/)
    })

    await t.test('true idle output is terminated with lastActivityAt', async () => {
      process.env.MAH_TEST_CODEX_BEHAVIOR = 'idle'
      const result = await adapter.execute('test', {
        model: 'test-model',
        cwd: root,
        idleTimeoutMs: 40,
        absoluteTimeoutMs: 500,
      })
      assert.equal(result.success, false)
      assert.equal(result.termination?.reason, 'idle-timeout')
      assert.match(result.termination?.lastActivityAt ?? '', /^20/)
    })

    await t.test('continuous activity stops at the absolute ceiling', async () => {
      process.env.MAH_TEST_CODEX_BEHAVIOR = 'absolute'
      const result = await adapter.execute('test', {
        model: 'test-model',
        cwd: root,
        idleTimeoutMs: 50,
        absoluteTimeoutMs: 140,
      })
      assert.equal(result.success, false)
      assert.equal(result.termination?.reason, 'absolute-timeout')
    })

    await t.test('large final output is bounded and raw activity remains separate', async () => {
      process.env.MAH_TEST_CODEX_BEHAVIOR = 'large'
      const rawActivityPath = join(rawDir, 'large.log')
      const result = await adapter.execute('test', {
        model: 'test-model',
        cwd: root,
        idleTimeoutMs: 500,
        absoluteTimeoutMs: 1_000,
        transcriptMaxChars: 1_000,
        rawActivityPath,
      })
      assert.equal(result.output.length, 1_000)
      assert.match(result.output, /^HEAD:/)
      assert.match(result.output, /full raw activity is stored separately/)
      assert.match(result.output, /:TAIL$/)
      assert.equal(existsSync(rawActivityPath), true)
      assert.ok(readFileSync(rawActivityPath, 'utf8').length > result.output.length)
    })
  } finally {
    process.env.PATH = originalPath
    if (originalBehavior === undefined) delete process.env.MAH_TEST_CODEX_BEHAVIOR
    else process.env.MAH_TEST_CODEX_BEHAVIOR = originalBehavior
    rmSync(root, { recursive: true, force: true })
  }
})
