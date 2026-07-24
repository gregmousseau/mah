import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { generateContract } from './contract.js'
import { loadRecoverableCheckpoint } from './checkpoint.js'
import { EventLogger } from './events.js'
import { runExistingContract } from './pipeline.js'
import type { ProjectConfig } from './types.js'

test('explicit QA-only resume fails closed before Dev when the transcript is missing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-qa-only-pipeline-'))
  const repo = join(root, 'repo')
  const sprint = join(root, 'sprint')
  mkdirSync(repo)
  mkdirSync(sprint)
  try {
    execFileSync('git', ['init', '-q'], { cwd: repo })
    execFileSync('git', ['config', 'user.email', 'mah-test@example.invalid'], { cwd: repo })
    execFileSync('git', ['config', 'user.name', 'MAH Test'], { cwd: repo })
    writeFileSync(join(repo, 'candidate.txt'), 'base\n')
    execFileSync('git', ['add', 'candidate.txt'], { cwd: repo })
    execFileSync('git', ['commit', '-m', 'base'], { cwd: repo })
    const candidateSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repo,
      encoding: 'utf8',
    }).trim()
    const config: ProjectConfig = {
      project: { name: 'Fixture', repo },
      priorities: { speed: 1, quality: 2, cost: 3 },
      agents: {
        generator: { type: 'codex', model: 'test-model', cwd: repo },
        evaluator: { type: 'codex', model: 'test-model', cwd: repo },
      },
      qa: { defaultTier: 'targeted', maxIterations: 1, verdictMode: 'fail-closed' },
      execution: {
        devIdleTimeoutMinutes: 12,
        devAbsoluteTimeoutMinutes: 45,
        transcriptMaxChars: 32_000,
      },
      human: {
        notificationChannel: '',
        responseTimeoutMinutes: 30,
        onTimeout: 'pause',
        costThreshold: 40,
      },
      metrics: { output: join(root, 'metrics') },
      sprints: { directory: join(root, 'sprints') },
    }
    const contract = generateContract('Fixture task', config, 'fixture')
    await assert.rejects(
      runExistingContract(
        contract,
        config,
        new EventLogger(join(root, 'events')),
        sprint,
        { qaOnly: { candidateSha, round: 1 } },
      ),
      /QA-only resume requires a persisted transcript/,
    )
    assert.equal(
      execFileSync('git', ['status', '--porcelain'], {
        cwd: repo,
        encoding: 'utf8',
      }),
      '',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a newly created dirty checkpoint is returned as a dashboard-blocking crash error', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-dirty-pipeline-'))
  const repo = join(root, 'repo')
  const sprint = join(root, 'sprint')
  const bin = join(root, 'bin')
  const originalPath = process.env.PATH
  const heartbeatPath = join(process.cwd(), '.mah', 'heartbeat.json')
  const notificationPath = join(process.cwd(), '.mah', 'notifications', 'latest.json')
  const heartbeatSnapshot = existsSync(heartbeatPath) ? readFileSync(heartbeatPath) : null
  const notificationSnapshot = existsSync(notificationPath) ? readFileSync(notificationPath) : null
  mkdirSync(repo)
  mkdirSync(sprint)
  mkdirSync(bin)
  try {
    execFileSync('git', ['init', '-q'], { cwd: repo })
    execFileSync('git', ['config', 'user.email', 'mah-test@example.invalid'], { cwd: repo })
    execFileSync('git', ['config', 'user.name', 'MAH Test'], { cwd: repo })
    writeFileSync(join(repo, 'candidate.txt'), 'base\n')
    execFileSync('git', ['add', 'candidate.txt'], { cwd: repo })
    execFileSync('git', ['commit', '-m', 'base'], { cwd: repo })
    const codex = join(bin, 'codex')
    writeFileSync(codex, `#!/usr/bin/env bash
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
input="$(cat)"
if [[ "$input" == *"MAH_PROVIDER_OK"* ]]; then
  printf MAH_PROVIDER_OK > "$output"
else
  printf 'checkpoint work\\n' > candidate.txt
  printf '# Dev Completion Report\\n' > "$output"
fi
`)
    chmodSync(codex, 0o755)
    process.env.PATH = `${bin}:${originalPath ?? ''}`
    const config = fixtureConfig(root, repo)
    const contract = generateContract('Fixture task', config, 'fixture')
    const result = await runExistingContract(
      contract,
      config,
      new EventLogger(join(root, 'events')),
      sprint,
    )
    assert.match(result.crashError?.message ?? '', /MAH_RECOVERABLE_CHECKPOINT/)
    assert.equal(loadRecoverableCheckpoint(sprint)?.status, 'dirty')
    assert.equal(existsSync(join(sprint, 'transcript.json')), true)
  } finally {
    process.env.PATH = originalPath
    restoreFile(heartbeatPath, heartbeatSnapshot)
    restoreFile(notificationPath, notificationSnapshot)
    rmSync(root, { recursive: true, force: true })
  }
})

function fixtureConfig(root: string, repo: string): ProjectConfig {
  return {
    project: { name: 'Fixture', repo },
    priorities: { speed: 1, quality: 2, cost: 3 },
    agents: {
      generator: { type: 'codex', model: 'test-model', cwd: repo },
      evaluator: { type: 'codex', model: 'test-model', cwd: repo },
    },
    qa: { defaultTier: 'targeted', maxIterations: 1, verdictMode: 'fail-closed' },
    execution: {
      devIdleTimeoutMinutes: 12,
      devAbsoluteTimeoutMinutes: 45,
      transcriptMaxChars: 32_000,
    },
    human: {
      notificationChannel: '',
      responseTimeoutMinutes: 30,
      onTimeout: 'pause',
      costThreshold: 40,
    },
    metrics: { output: join(root, 'metrics') },
    sprints: { directory: join(root, 'sprints') },
  }
}

function restoreFile(path: string, snapshot: Buffer | null): void {
  if (snapshot === null) {
    rmSync(path, { force: true })
    return
  }
  writeFileSync(path, snapshot)
}
