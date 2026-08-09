import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import type { DeliveryEvaluationProvenance, Grader, GraderResult } from './types.js'
import {
  buildConsolidatedRepairBrief,
  evaluateDeliveryVerdict,
  identityMismatch,
  inspectDeliveryPreflight,
} from './reliability.js'

test('delivery round integrates mixed graders, repair evidence, and exact-SHA blocking', () => {
  const repo = mkdtempSync(join(tmpdir(), 'mah-248-integration-'))
  execFileSync('git', ['init'], { cwd: repo })
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repo })
  execFileSync('git', ['config', 'user.name', 'MAH Test'], { cwd: repo })
  writeFileSync(join(repo, 'package-lock.json'), '{"lockfileVersion":3}\n')
  writeFileSync(join(repo, 'candidate.txt'), 'round-one\n')
  execFileSync('git', ['add', '.'], { cwd: repo })
  execFileSync('git', ['commit', '-m', 'candidate one'], { cwd: repo })

  const before = inspectDeliveryPreflight(repo).identity
  const graders: Grader[] = [
    { id: 'ux', type: 'ux', name: 'UX', enabled: true, agent: { type: 'openclaw', model: 'fixture' } },
    { id: 'code', type: 'code-review', name: 'Code', enabled: true, agent: { type: 'openclaw', model: 'fixture' } },
  ]
  const results: GraderResult[] = [
    makeResult('ux', 'pass', []),
    makeResult('code', 'conditional', [{
      id: 'CR-01',
      severity: 'major',
      category: 'bug',
      description: 'Repair the exact candidate before delivery.',
    }]),
  ]
  const delivery = evaluateDeliveryVerdict(graders, results)
  assert.equal(delivery.verdict, 'fail')
  assert.match(buildConsolidatedRepairBrief(results), /Code.*CR-01/)

  writeFileSync(join(repo, 'candidate.txt'), 'round-two\n')
  execFileSync('git', ['add', '.'], { cwd: repo })
  execFileSync('git', ['commit', '-m', 'candidate two'], { cwd: repo })
  const after = inspectDeliveryPreflight(repo).identity
  assert.equal(identityMismatch(before, after)?.kind, 'identity')
})

test('golden sprint-20260809-201539-994f6a keeps evaluator meta-prose out of the product verdict', () => {
  const fixture = JSON.parse(readFileSync(resolve(
    process.cwd(),
    'src/__fixtures__/reliability/awc-313-self-reference.json',
  ), 'utf8')) as DeliveryEvaluationProvenance & {
    configuredGraders: Pick<Grader, 'id' | 'name' | 'enabled'>[]
    results: GraderResult[]
  }
  const delivery = evaluateDeliveryVerdict(
    fixture.configuredGraders,
    fixture.results,
    'fail-closed',
    fixture,
  )
  assert.equal(fixture.sprintId, 'sprint-20260809-201539-994f6a')
  assert.equal(delivery.verdict, 'pass')
  assert.deepEqual(delivery.failures, [])
  assert.equal(delivery.harnessDiagnostics?.[0]?.stage, 'evaluator-self-reference')
})

function makeResult(
  graderId: string,
  verdict: GraderResult['verdict'],
  findings: GraderResult['findings'],
): GraderResult {
  return {
    graderId,
    graderType: graderId,
    graderName: graderId === 'ux' ? 'UX' : 'Code',
    verdict,
    findings,
    summary: '',
    model: 'fixture',
    durationMs: 1,
    costEstimate: 0,
  }
}
