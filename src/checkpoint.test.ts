import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  loadRecoverableCheckpoint,
  persistRecoverableCheckpoint,
  recoverableCheckpointError,
  verifyQAOnlyResume,
} from './checkpoint.js'
import type { AgentResult } from './types.js'

test('dirty Dev work is persisted as a recoverable checkpoint', () => {
  const fixture = createRepo()
  try {
    writeFileSync(join(fixture.repo, 'candidate.txt'), 'checkpoint work\n')
    const result = agentResult('idle-timeout')
    const checkpoint = persistRecoverableCheckpoint({
      sprintPath: fixture.sprint,
      repoPath: fixture.repo,
      round: 1,
      result,
    })
    assert.ok(checkpoint)
    assert.equal(checkpoint.status, 'dirty')
    assert.deepEqual(checkpoint.dirtyPaths, ['candidate.txt'])
    assert.equal(checkpoint.termination?.reason, 'idle-timeout')
    assert.match(recoverableCheckpointError(checkpoint).message, /ordinary Dev retry is blocked/)
    assert.deepEqual(loadRecoverableCheckpoint(fixture.sprint), checkpoint)
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('QA-only resume requires the exact clean commit derived from the checkpoint', () => {
  const fixture = createRepo()
  try {
    writeFileSync(join(fixture.repo, 'candidate.txt'), 'checkpoint work\n')
    const checkpoint = persistRecoverableCheckpoint({
      sprintPath: fixture.sprint,
      repoPath: fixture.repo,
      round: 2,
      result: agentResult('absolute-timeout'),
    })
    assert.ok(checkpoint)
    execFileSync('git', ['add', 'candidate.txt'], { cwd: fixture.repo })
    execFileSync('git', ['commit', '-m', 'recover checkpoint'], { cwd: fixture.repo })
    const candidateSha = gitSha(fixture.repo)

    assert.throws(
      () => verifyQAOnlyResume({
        sprintPath: fixture.sprint,
        repoPath: fixture.repo,
        request: { candidateSha: checkpoint.baseHeadSha, round: 2 },
      }),
      /candidate mismatch/,
    )

    const identity = verifyQAOnlyResume({
      sprintPath: fixture.sprint,
      repoPath: fixture.repo,
      request: { candidateSha, round: 2 },
    })
    assert.equal(identity.candidateSha, candidateSha)
    assert.equal(loadRecoverableCheckpoint(fixture.sprint)?.status, 'verified')
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('QA-only resume rejects replacement content at the same checkpoint paths', () => {
  const fixture = createRepo()
  try {
    writeFileSync(join(fixture.repo, 'candidate.txt'), 'checkpoint work\n')
    const checkpoint = persistRecoverableCheckpoint({
      sprintPath: fixture.sprint,
      repoPath: fixture.repo,
      round: 1,
      result: agentResult('idle-timeout'),
    })
    assert.ok(checkpoint)
    writeFileSync(join(fixture.repo, 'candidate.txt'), 'unrelated replacement\n')
    execFileSync('git', ['add', 'candidate.txt'], { cwd: fixture.repo })
    execFileSync('git', ['commit', '-m', 'replace checkpoint'], { cwd: fixture.repo })

    assert.throws(
      () => verifyQAOnlyResume({
        sprintPath: fixture.sprint,
        repoPath: fixture.repo,
        request: { candidateSha: gitSha(fixture.repo), round: 1 },
      }),
      /content does not match/,
    )
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

function createRepo(): { root: string; repo: string; sprint: string } {
  const root = mkdtempSync(join(tmpdir(), 'mah-checkpoint-test-'))
  const repo = join(root, 'repo')
  const sprint = join(root, 'sprint')
  mkdirSync(repo)
  mkdirSync(sprint)
  execFileSync('git', ['init', '-q'], { cwd: repo })
  execFileSync('git', ['config', 'user.email', 'mah-test@example.invalid'], { cwd: repo })
  execFileSync('git', ['config', 'user.name', 'MAH Test'], { cwd: repo })
  writeFileSync(join(repo, 'candidate.txt'), 'base\n')
  execFileSync('git', ['add', 'candidate.txt'], { cwd: repo })
  execFileSync('git', ['commit', '-m', 'base'], { cwd: repo })
  return { root, repo, sprint }
}

function gitSha(repo: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim()
}

function agentResult(
  reason: NonNullable<AgentResult['termination']>['reason'],
): AgentResult {
  return {
    success: false,
    output: 'bounded failure response',
    rawActivityPath: '/tmp/raw-activity.log',
    termination: {
      reason,
      lastActivityAt: '2026-07-24T12:00:00.000Z',
    },
    timing: { startMs: 0, endMs: 1, durationMs: 1 },
  }
}
