import assert from 'node:assert/strict'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { OpenClawGatewayAdapter } from './gateway.js'
import { KiloAdapter } from './kilo.js'
import { OpenClawAdapter } from './openclaw.js'

test('every non-Codex Dev provider uses activity-aware execution metadata and raw storage', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'mah-provider-execution-'))
  const bin = join(root, 'bin')
  const openclaw = join(bin, 'openclaw')
  const claude = join(bin, 'claude')
  const originalPath = process.env.PATH
  const originalOpenClaw = process.env.OPENCLAW_CMD
  const originalClaude = process.env.CLAUDE_CMD
  try {
    mkdirSync(bin)
    writeFileSync(openclaw, `#!/bin/sh
for _ in 1 2 3 4 5 6; do
  sleep 0.05
  echo progress >&2
done
case " $* " in
  *" kilocode/test-model "*) provider=kilocode ;;
  *) provider=test-provider ;;
esac
printf '{"result":{"payloads":[{"text":"PROVIDER_OK"}],"meta":{"agentMeta":{"provider":"%s","model":"test-model"}}}}\\n' "$provider"
`)
    writeFileSync(claude, `#!/bin/sh
for _ in 1 2 3 4 5 6; do
  sleep 0.05
  echo progress >&2
done
echo CLAUDE_OK
`)
    chmodSync(openclaw, 0o755)
    chmodSync(claude, 0o755)
    process.env.PATH = `${bin}:${originalPath ?? ''}`
    process.env.OPENCLAW_CMD = openclaw
    process.env.CLAUDE_CMD = claude

    await t.test('OpenClaw gateway', async () => {
      const rawActivityPath = join(root, 'gateway.log')
      const result = await new OpenClawGatewayAdapter().execute('test', {
        model: 'test-provider/test-model',
        cwd: root,
        idleTimeoutMs: 200,
        absoluteTimeoutMs: 1_000,
        rawActivityPath,
      })
      assert.equal(result.success, true)
      assert.equal(result.termination?.reason, 'completed')
      assert.match(readFileSync(rawActivityPath, 'utf8'), /progress/)
    })

    await t.test('Kilo through OpenClaw', async () => {
      const rawActivityPath = join(root, 'kilo.log')
      const result = await new KiloAdapter().execute('test', {
        model: 'test-model',
        cwd: root,
        idleTimeoutMs: 200,
        absoluteTimeoutMs: 1_000,
        rawActivityPath,
      })
      assert.equal(result.success, true)
      assert.equal(result.termination?.reason, 'completed')
      assert.match(readFileSync(rawActivityPath, 'utf8'), /progress/)
    })

    await t.test('Claude CLI', async () => {
      const rawActivityPath = join(root, 'claude.log')
      const result = await new OpenClawAdapter().execute('test', {
        model: 'test-model',
        cwd: root,
        idleTimeoutMs: 200,
        absoluteTimeoutMs: 1_000,
        rawActivityPath,
      })
      assert.equal(result.success, true)
      assert.equal(result.termination?.reason, 'completed')
      assert.match(result.output, /CLAUDE_OK/)
      assert.match(readFileSync(rawActivityPath, 'utf8'), /progress/)
    })
  } finally {
    process.env.PATH = originalPath
    if (originalOpenClaw === undefined) delete process.env.OPENCLAW_CMD
    else process.env.OPENCLAW_CMD = originalOpenClaw
    if (originalClaude === undefined) delete process.env.CLAUDE_CMD
    else process.env.CLAUDE_CMD = originalClaude
    rmSync(root, { recursive: true, force: true })
  }
})
