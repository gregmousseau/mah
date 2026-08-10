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

test('a dirty target fails before the configured provider is probed', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-target-first-preflight-'))
  const repo = join(root, 'repo')
  const sprint = join(root, 'sprint')
  const bin = join(root, 'bin')
  const providerMarker = join(root, 'provider-called')
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
    writeFileSync(join(repo, 'candidate.txt'), 'dirty\n')
    const codex = join(bin, 'codex')
    writeFileSync(codex, `#!/usr/bin/env bash
set -eu
printf called > ${JSON.stringify(providerMarker)}
`)
    chmodSync(codex, 0o755)
    process.env.PATH = `${bin}:${originalPath ?? ''}`

    const config = fixtureConfig(root, repo)
    const contract = generateContract('Fixture task', config, 'fixture-target-first')
    const result = await runExistingContract(
      contract,
      config,
      new EventLogger(join(root, 'events')),
      sprint,
    )
    assert.match(result.crashError?.message ?? '', /candidate worktree is not clean/i)
    assert.equal(existsSync(providerMarker), false)
  } finally {
    process.env.PATH = originalPath
    restoreFile(heartbeatPath, heartbeatSnapshot)
    restoreFile(notificationPath, notificationSnapshot)
    rmSync(root, { recursive: true, force: true })
  }
})

test('target identity is rechecked after provider preflight and before Dev', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-target-recheck-preflight-'))
  const repo = join(root, 'repo')
  const sprint = join(root, 'sprint')
  const bin = join(root, 'bin')
  const devMarker = join(root, 'dev-called')
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
  printf 'changed during provider preflight\n' >> candidate.txt
  printf MAH_PROVIDER_OK > "$output"
else
  printf called > ${JSON.stringify(devMarker)}
fi
`)
    chmodSync(codex, 0o755)
    process.env.PATH = `${bin}:${originalPath ?? ''}`

    const config = fixtureConfig(root, repo)
    const contract = generateContract('Fixture task', config, 'fixture-target-recheck')
    const result = await runExistingContract(
      contract,
      config,
      new EventLogger(join(root, 'events')),
      sprint,
    )
    assert.match(result.crashError?.message ?? '', /Candidate identity preflight failed.*not clean/i)
    assert.equal(existsSync(devMarker), false)
    assert.equal(result.contract.executionPreflight?.repoRoot, repo)
  } finally {
    process.env.PATH = originalPath
    restoreFile(heartbeatPath, heartbeatSnapshot)
    restoreFile(notificationPath, notificationSnapshot)
    rmSync(root, { recursive: true, force: true })
  }
})

test('a newly created dirty checkpoint is returned as a dashboard-blocking crash error', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-dirty-pipeline-'))
  const repo = join(root, 'repo')
  const sprint = join(root, 'sprint')
  const bin = join(root, 'bin')
  const devPromptPath = join(root, 'dev-prompt.txt')
  const dirtyPrimary = join(root, 'dirty-primary')
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
  printf '%s' "$input" > ${JSON.stringify(devPromptPath)}
  printf 'checkpoint work\\n' > candidate.txt
  printf '# Dev Completion Report\\n' > "$output"
fi
`)
    chmodSync(codex, 0o755)
    process.env.PATH = `${bin}:${originalPath ?? ''}`
    const config = fixtureConfig(root, repo)
    config.project.repo = dirtyPrimary
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
    assert.equal(result.contract.executionPreflight?.repoRoot, repo)
    assert.equal(result.contract.executionPreflight?.generatorModel, 'test-model')
    assert.equal(result.contract.devBrief.repo, repo)
    assert.match(readFileSync(devPromptPath, 'utf8'), new RegExp(`## Repository\\n${escapeRegex(repo)}`))
    assert.doesNotMatch(readFileSync(devPromptPath, 'utf8'), new RegExp(escapeRegex(dirtyPrimary)))
  } finally {
    process.env.PATH = originalPath
    restoreFile(heartbeatPath, heartbeatSnapshot)
    restoreFile(notificationPath, notificationSnapshot)
    rmSync(root, { recursive: true, force: true })
  }
})

test('an omitted generator cwd executes in the canonical project worktree', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-canonical-fallback-pipeline-'))
  const repo = join(root, 'repo')
  const sprint = join(root, 'sprint')
  const bin = join(root, 'bin')
  const devCwdPath = join(root, 'dev-cwd.txt')
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
  pwd > ${JSON.stringify(devCwdPath)}
  printf 'checkpoint work\n' > candidate.txt
  printf '# Dev Completion Report\n' > "$output"
fi
`)
    chmodSync(codex, 0o755)
    process.env.PATH = `${bin}:${originalPath ?? ''}`
    const config = fixtureConfig(root, repo)
    config.agents.generator.cwd = undefined
    const contract = generateContract('Fixture task', config, 'fixture-canonical-fallback')
    const result = await runExistingContract(
      contract,
      config,
      new EventLogger(join(root, 'events')),
      sprint,
    )
    assert.match(result.crashError?.message ?? '', /MAH_RECOVERABLE_CHECKPOINT/)
    assert.equal(readFileSync(devCwdPath, 'utf8').trim(), repo)
    assert.equal(result.contract.devBrief.repo, repo)
  } finally {
    process.env.PATH = originalPath
    restoreFile(heartbeatPath, heartbeatSnapshot)
    restoreFile(notificationPath, notificationSnapshot)
    rmSync(root, { recursive: true, force: true })
  }
})

test('runtime evaluator override is preflighted before Dev on an existing contract', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-evaluator-preflight-pipeline-'))
  const repo = join(root, 'repo')
  const sprint = join(root, 'sprint')
  const bin = join(root, 'bin')
  const devMarker = join(root, 'dev-called')
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
model=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output-last-message" ]]; then
    output="$2"
    shift 2
  elif [[ "$1" == "--model" ]]; then
    model="$2"
    shift 2
  else
    shift
  fi
done
input="$(cat)"
if [[ "$input" == *"MAH_PROVIDER_OK"* ]]; then
  if [[ "$model" == "runtime-evaluator" ]]; then
    printf 'runtime evaluator unavailable' >&2
    exit 23
  fi
  printf MAH_PROVIDER_OK > "$output"
else
  printf called > ${JSON.stringify(devMarker)}
fi
`)
    chmodSync(codex, 0o755)
    process.env.PATH = `${bin}:${originalPath ?? ''}`
    const config = fixtureConfig(root, repo)
    config.agents.evaluator = { type: 'codex', model: 'runtime-evaluator', cwd: repo }
    config.runtime = {
      agentOverrides: {
        evaluator: { type: 'codex', model: 'runtime-evaluator' },
      },
    }
    const contract = generateContract('Fixture task', config, 'fixture-evaluator-preflight')
    contract.graders = [{
      id: 'ux-stale',
      type: 'ux',
      name: 'Stale UX',
      enabled: true,
      agent: { type: 'claude-cli', model: 'stale-model', cwd: repo },
    }]
    const result = await runExistingContract(
      contract,
      config,
      new EventLogger(join(root, 'events')),
      sprint,
    )
    assert.match(
      result.crashError?.message ?? '',
      /Provider preflight failed for codex\/runtime-evaluator/,
    )
    assert.equal(existsSync(devMarker), false)
  } finally {
    process.env.PATH = originalPath
    restoreFile(heartbeatPath, heartbeatSnapshot)
    restoreFile(notificationPath, notificationSnapshot)
    rmSync(root, { recursive: true, force: true })
  }
})

test('grader drift blocks repair-round Dev before a second invocation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-repair-identity-pipeline-'))
  const repo = join(root, 'repo')
  const sprint = join(root, 'sprint')
  const bin = join(root, 'bin')
  const devCountPath = join(root, 'dev-count.txt')
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
elif [[ "$input" == *"You are Quinn, a QA engineer"* ]]; then
  printf drift > grader-drift.txt
  cat > "$output" <<'REPORT'
# QA Report
## Verdict: FAIL
## Summary
The fixture intentionally fails.
## Defects Found
**P1-01:** Fixture failure.
  Finding category: product
  Scope relationship: introduced
  Release impact: required-for-release-safety
  Evidence confidence: confirmed
## Recommendation
FAIL
REPORT
else
  count=0
  if [[ -f ${JSON.stringify(devCountPath)} ]]; then count="$(cat ${JSON.stringify(devCountPath)})"; fi
  count=$((count + 1))
  printf '%s' "$count" > ${JSON.stringify(devCountPath)}
  printf '# Dev Completion Report\nNo changes required.\n' > "$output"
fi
`)
    chmodSync(codex, 0o755)
    process.env.PATH = `${bin}:${originalPath ?? ''}`
    const config = fixtureConfig(root, repo)
    config.qa.maxIterations = 2
    config.findings = {
      scopeGate: 'advisory',
      findingsMode: 'off',
      ticketDispatchEnabled: false,
      currentPrPaths: [],
    }
    const contract = generateContract('Fixture task', config, 'fixture-repair-identity')
    contract.graders = [contract.graders[0]!]
    const result = await runExistingContract(
      contract,
      config,
      new EventLogger(join(root, 'events')),
      sprint,
    )
    assert.match(result.crashError?.message ?? '', /Candidate identity preflight failed.*not clean/i)
    assert.equal(readFileSync(devCountPath, 'utf8'), '1')
  } finally {
    process.env.PATH = originalPath
    restoreFile(heartbeatPath, heartbeatSnapshot)
    restoreFile(notificationPath, notificationSnapshot)
    rmSync(root, { recursive: true, force: true })
  }
})

test('production caller persists exact-candidate provenance and separates self-reference diagnostics', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-provenance-pipeline-'))
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
    writeFileSync(join(repo, 'candidate.txt'), 'candidate\n')
    execFileSync('git', ['add', 'candidate.txt'], { cwd: repo })
    execFileSync('git', ['commit', '-m', 'candidate'], { cwd: repo })
    const candidateSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repo,
      encoding: 'utf8',
    }).trim()
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
elif [[ "$input" == *"You are Quinn, a QA engineer"* ]]; then
  cat > "$output" <<'REPORT'
# QA Report
## Verdict: PASS
## Summary
Structured checks passed the exact candidate.
## Defects Found
**P1-01:** MAH did not run, so no evaluation was performed.
  Finding category: evaluation-self-reference
  Scope relationship: introduced
  Release impact: required-for-release-safety
  Evidence confidence: confirmed
## Recommendation
PASS
MAH_EVALUATION_EVIDENCE: {"sprintId":"fixture-provenance","graderId":"ux-quinn","evaluatorId":"codex:test-model","candidateSha":"${candidateSha}","explicitVerdict":"pass"}
REPORT
else
  printf '# Dev Completion Report\nNo changes required.\n' > "$output"
fi
`)
    chmodSync(codex, 0o755)
    process.env.PATH = `${bin}:${originalPath ?? ''}`
    const config = fixtureConfig(root, repo)
    config.findings = {
      scopeGate: 'advisory',
      findingsMode: 'off',
      ticketDispatchEnabled: false,
      currentPrPaths: [],
    }
    const contract = generateContract('Fixture task', config, 'fixture-provenance')
    contract.graders = [contract.graders.find(grader => grader.type === 'ux')!]

    const result = await runExistingContract(
      contract,
      config,
      new EventLogger(join(root, 'events')),
      sprint,
    )

    assert.equal(result.contract.status, 'passed')
    const persisted = JSON.parse(
      readFileSync(join(sprint, 'contract.json'), 'utf8'),
    ) as typeof result.contract
    const iteration = persisted.iterations[0]!
    assert.deepEqual(iteration.evaluationProvenance, {
      sprintId: contract.id,
      evaluatorId: 'codex:test-model',
      candidateSha,
      graders: [{
        sprintId: contract.id,
        graderId: contract.graders[0]!.id,
        evaluatorId: 'codex:test-model',
        expectedEvaluatorId: 'codex:test-model',
        candidateSha,
        processExit: 'completed',
        explicitVerdict: 'pass',
        finalArtifact: 'available',
      }],
    })
    assert.equal(iteration.harnessDiagnostics?.[0]?.stage, 'evaluator-self-reference')
    assert.deepEqual(iteration.deliveryFailures, [])
    assert.deepEqual(iteration.defects, [])
    assert.equal(iteration.graderResults?.[0]?.findings.length, 1)
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
