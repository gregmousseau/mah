import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import type { Grader, GraderResult } from './types.js'
import {
  buildConsolidatedRepairBrief,
  buildRepairFeedback,
  canResumeQAWithPinnedCandidate,
  classifyDeliveryError,
  evaluateDeliveryVerdict,
  identityMismatch,
  hasCompleteRequiredGraderResults,
  inspectDeliveryPreflight,
  materialGraderFindings,
  restoreRepairFeedback,
  verifyDeliveryIdentity,
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

test('chain-style QA pass cannot advance without the configured code-review result', () => {
  const delivery = evaluateDeliveryVerdict(graders, [result('ux', 'pass')], 'fail-closed')
  assert.equal(delivery.verdict, 'fail')
  assert.match(delivery.failures[0]?.message ?? '', /Code.*produced no result/)
})

test('a PASS verdict cannot override a material grader finding', () => {
  const contradictory = {
    ...result('code', 'pass'),
    findings: [{
      id: 'CR-01',
      severity: 'major' as const,
      category: 'bug',
      description: 'Material defect contradicts PASS.',
    }],
  }
  assert.equal(evaluateDeliveryVerdict(
    graders,
    [result('ux', 'pass'), contradictory],
    'fail-closed',
  ).verdict, 'fail')
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

test('repair feedback includes fail-closed delivery evidence for the next dev round', () => {
  const feedback = buildRepairFeedback('## Verdict: PASS', [{
    kind: 'identity',
    stage: 'chain-qa-r1-final-preflight',
    message: 'Candidate identity changed.',
  }])
  assert.match(feedback, /Verdict: PASS/)
  assert.match(feedback, /IDENTITY.*chain-qa-r1-final-preflight.*Candidate identity changed/)
})

test('resume repair feedback rebuilds the persisted consolidated brief', () => {
  const feedback = restoreRepairFeedback('raw final grader only', [
    { ...result('ux', 'fail'), graderName: 'UX', summary: 'Earlier grader failed.' },
    { ...result('code', 'pass'), graderName: 'Code' },
  ], [{ kind: 'preflight', stage: 'qa-r1-final-preflight', message: 'Dirty artifact.' }])
  assert.match(feedback, /UX.*Earlier grader failed/)
  assert.match(feedback, /PREFLIGHT.*Dirty artifact/)
  assert.doesNotMatch(feedback, /raw final grader only/)
})

test('QA resume requires a candidate identity pinned to the same round', () => {
  const identity = { candidateSha: 'a'.repeat(40), dependencyFingerprint: null }
  assert.equal(canResumeQAWithPinnedCandidate(undefined, undefined, 2, 'fail-closed'), false)
  assert.equal(canResumeQAWithPinnedCandidate(identity, 1, 2, 'fail-closed'), false)
  assert.equal(canResumeQAWithPinnedCandidate(identity, 2, 2, 'fail-closed'), true)
  assert.equal(canResumeQAWithPinnedCandidate(undefined, undefined, 2, 'legacy'), true)
})

test('resume advances only after every required grader result was persisted', () => {
  assert.equal(hasCompleteRequiredGraderResults(graders, undefined, 'fail-closed'), false)
  assert.equal(hasCompleteRequiredGraderResults(graders, [result('ux', 'pass')], 'fail-closed'), false)
  assert.equal(hasCompleteRequiredGraderResults(
    graders,
    [result('ux', 'pass'), result('code', 'fail')],
    'fail-closed',
  ), true)
  assert.equal(hasCompleteRequiredGraderResults(graders, undefined, 'legacy'), true)
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

test('preflight resolves a monorepo package directory to its Git worktree root', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-248-monorepo-'))
  const app = join(root, 'apps', 'portal')
  mkdirSync(app, { recursive: true })
  execFileSync('git', ['init'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'MAH Test'], { cwd: root })
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3}\n')
  writeFileSync(join(app, 'index.ts'), 'export {}\n')
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root })
  writeFileSync(join(app, '.env.mah.local'), 'FIXTURE=1\n')

  const checked = inspectDeliveryPreflight(app)
  assert.equal(checked.identity.candidateSha, execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim())
  assert.match(checked.identity.dependencyFingerprint ?? '', /^package-lock\.json:sha256:/)
  assert.equal(checked.envFile, join(app, '.env.mah.local'))
})

test('preflight permits an invocation-local MAH env file inside the worktree', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-248-invocation-env-'))
  const app = join(root, 'apps', 'portal')
  const invocation = join(root, 'tools', 'mah')
  mkdirSync(app, { recursive: true })
  mkdirSync(invocation, { recursive: true })
  execFileSync('git', ['init'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'MAH Test'], { cwd: root })
  writeFileSync(join(app, 'index.ts'), 'export {}\n')
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root })
  writeFileSync(join(invocation, '.env.mah.local'), 'FIXTURE=1\n')

  const checked = inspectDeliveryPreflight(app, { invocationPath: invocation })
  assert.equal(checked.envFile, join(invocation, '.env.mah.local'))
})

test('persisted defect findings exclude informational observations', () => {
  const findings = materialGraderFindings([{
    ...result('code', 'pass'),
    findings: [
      { id: 'CR-INFO', severity: 'info', category: 'note', description: 'Observation only.' },
      { id: 'CR-MAJOR', severity: 'major', category: 'bug', description: 'Material defect.' },
    ],
  }])
  assert.deepEqual(findings.map((finding) => finding.id), ['CR-MAJOR'])
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
  mkdirSync(join(root, '.mah', 'projects'), { recursive: true })
  writeFileSync(join(root, '.mah', 'projects', 'awc.json'), '{}\n')
  assert.throws(
    () => inspectDeliveryPreflight(root, { ignoredStatePaths: ['runtime/metrics'] }),
    /candidate worktree is not clean/i,
  )
  rmSync(join(root, '.mah', 'projects'), { recursive: true })
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

test('final preflight failures are returned as delivery evidence instead of thrown', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-248-final-preflight-'))
  execFileSync('git', ['init'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'MAH Test'], { cwd: root })
  writeFileSync(join(root, 'tracked.txt'), 'clean\n')
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root })
  const expected = inspectDeliveryPreflight(root).identity
  writeFileSync(join(root, 'grader-artifact.txt'), 'left behind\n')

  const failure = verifyDeliveryIdentity(root, expected, {}, 'qa-r1-final-preflight')
  assert.equal(failure?.kind, 'preflight')
  assert.equal(failure?.stage, 'qa-r1-final-preflight')
  assert.match(failure?.message ?? '', /candidate worktree is not clean/i)
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
  const brief = buildConsolidatedRepairBrief(fixture.results, delivery.failures)
  assert.equal(delivery.verdict, 'fail')
  assert.equal(delivery.failures[0]?.kind, 'harness')
  assert.doesNotMatch(delivery.failures[0]?.message ?? '', /product path failed/i)
  assert.match(brief, /\[HARNESS\]/)
  assert.doesNotMatch(brief, /\[Code Reviewer\] FAIL/)
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
