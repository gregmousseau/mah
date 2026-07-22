import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import type { Grader, GraderResult } from './types.js'
import {
  buildConsolidatedRepairBrief,
  classifyDeliveryError,
  evaluateDeliveryVerdict,
  identityMismatch,
  inspectDeliveryPreflight,
} from './reliability.js'

const graders: Grader[] = [
  { id: 'ux', type: 'ux', name: 'UX', enabled: true, agent: { type: 'openclaw', model: 'x' } },
  { id: 'code', type: 'code-review', name: 'Code', enabled: true, agent: { type: 'openclaw', model: 'x' } },
]

function result(graderId: string, verdict: GraderResult['verdict']): GraderResult {
  return {
    graderId,
    graderType: graderId,
    graderName: graderId,
    verdict,
    findings: [],
    summary: '',
    model: 'x',
    durationMs: 1,
    costEstimate: 0,
  }
}

test('fail-closed verdict rejects zero, missing, failed, timed-out, and conditional graders', () => {
  assert.equal(evaluateDeliveryVerdict([], []).verdict, 'fail')
  assert.equal(evaluateDeliveryVerdict(graders, [result('ux', 'pass')]).verdict, 'fail')
  assert.equal(evaluateDeliveryVerdict(graders, [
    result('ux', 'pass'),
    { ...result('code', 'pass'), executionStatus: 'timed_out' },
  ]).verdict, 'fail')
  assert.equal(evaluateDeliveryVerdict(graders, [result('ux', 'pass'), result('code', 'conditional')]).verdict, 'fail')
  assert.equal(evaluateDeliveryVerdict(graders, [result('ux', 'pass'), result('code', 'pass')]).verdict, 'pass')
})

test('legacy rollback retains the previous permissive aggregation', () => {
  assert.equal(evaluateDeliveryVerdict([], [], 'legacy').verdict, 'pass')
  assert.equal(
    evaluateDeliveryVerdict(graders, [result('ux', 'conditional')], 'legacy').verdict,
    'conditional',
  )
})

test('repair brief includes and deduplicates material findings from every grader', () => {
  const shared = {
    id: 'P2-1',
    severity: 'major' as const,
    category: 'bug',
    file: 'src/a.ts',
    line: 7,
    description: 'Repair this edge.',
  }
  const brief = buildConsolidatedRepairBrief([
    { ...result('ux', 'fail'), graderName: 'UX', findings: [shared] },
    { ...result('code', 'conditional'), graderName: 'Code', findings: [shared, { ...shared, id: 'P2-2', description: 'Code-only finding.' }] },
  ])
  assert.match(brief, /\[UX\].*Repair this edge/)
  assert.match(brief, /\[Code\].*Code-only finding/)
  assert.equal((brief.match(/Repair this edge/g) ?? []).length, 1)
})

test('repair brief preserves a conditional grader summary when it has no parsed findings', () => {
  const brief = buildConsolidatedRepairBrief([
    { ...result('code', 'conditional'), graderName: 'Code', summary: 'Review the release contract.' },
  ])
  assert.match(brief, /\[Code\] CONDITIONAL.*Review the release contract/)
})

test('normal linked worktree gitfiles and local env files pass preflight', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-248-'))
  const primary = join(root, 'primary')
  const worktree = join(root, 'worktree')
  mkdirSync(primary)
  execFileSync('git', ['init'], { cwd: primary })
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: primary })
  execFileSync('git', ['config', 'user.name', 'MAH Test'], { cwd: primary })
  writeFileSync(join(primary, 'package-lock.json'), '{"lockfileVersion":3}\n')
  execFileSync('git', ['add', '.'], { cwd: primary })
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: primary })
  execFileSync('git', ['worktree', 'add', worktree, '-b', 'fixture-worktree'], { cwd: primary })
  writeFileSync(join(worktree, '.env.mah.local'), 'FIXTURE=1\n')

  assert.ok(statIsFile(join(worktree, '.git')))
  const checked = inspectDeliveryPreflight(worktree)
  assert.match(checked.identity.candidateSha, /^[a-f0-9]{40}$/)
  assert.match(checked.identity.dependencyFingerprint ?? '', /^package-lock\.json:sha256:/)
  assert.equal(checked.envFile, join(worktree, '.env.mah.local'))
})

test('preflight rejects uncommitted candidate changes but permits the local MAH env file', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-248-dirty-'))
  execFileSync('git', ['init'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'MAH Test'], { cwd: root })
  writeFileSync(join(root, 'tracked.txt'), 'clean\n')
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root })
  writeFileSync(join(root, '.env.mah.local'), 'FIXTURE=1\n')
  assert.doesNotThrow(() => inspectDeliveryPreflight(root))
  mkdirSync(join(root, '.mah', 'sprints'), { recursive: true })
  writeFileSync(join(root, '.mah', 'sprints', 'contract.json'), '{}\n')
  mkdirSync(join(root, 'runtime', 'metrics'), { recursive: true })
  writeFileSync(join(root, 'runtime', 'metrics', 'latest.json'), '{}\n')
  assert.doesNotThrow(() => inspectDeliveryPreflight(root, {
    ignoredStatePaths: [join(root, 'runtime', 'metrics')],
  }))
  writeFileSync(join(root, 'tracked.txt'), 'dirty\n')
  assert.throws(() => inspectDeliveryPreflight(root), /candidate worktree is not clean/i)
})

test('identity mismatch blocks a merge-ready verdict', () => {
  const expected = { candidateSha: 'a'.repeat(40), dependencyFingerprint: 'lock:a' }
  assert.equal(identityMismatch(expected, expected), null)
  assert.equal(identityMismatch(expected, { ...expected, candidateSha: 'b'.repeat(40) })?.kind, 'identity')
  assert.equal(identityMismatch(expected, { ...expected, dependencyFingerprint: 'lock:b' })?.kind, 'identity')
  assert.equal(
    classifyDeliveryError(identityMismatch(expected, { ...expected, candidateSha: 'b'.repeat(40) })?.message, 'resume').kind,
    'identity',
  )
})

test('historical AWC-241 replay returns code-review findings to repair', () => {
  const fixture = readFixture('awc-241')
  const delivery = evaluateDeliveryVerdict(fixture.configuredGraders, fixture.results)
  const brief = buildConsolidatedRepairBrief(fixture.results, delivery.failures)
  assert.equal(delivery.verdict, 'fail')
  assert.deepEqual(delivery.failures, [])
  assert.match(brief, /Code Reviewer.*CR-01.*release-contract finding/)
})

test('historical AWC-194 replay classifies a reviewer interruption as harness failure', () => {
  const fixture = readFixture('awc-194')
  const delivery = evaluateDeliveryVerdict(fixture.configuredGraders, fixture.results)
  assert.equal(delivery.verdict, 'fail')
  assert.equal(delivery.failures[0]?.kind, 'harness')
  assert.doesNotMatch(delivery.failures[0]?.message ?? '', /product path failed/i)
})

function statIsFile(path: string): boolean {
  return statSync(path).isFile()
}

function readFixture(name: string): {
  configuredGraders: Pick<Grader, 'id' | 'name' | 'enabled'>[]
  results: GraderResult[]
} {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'src', '__fixtures__', 'reliability', `${name}.json`),
      'utf8',
    ),
  )
}
