import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasExplicitCodeReviewVerdict,
  parseCodeReviewResult,
} from './graders/code-review.js'
import { hasExplicitQAVerdict, parseQAReport } from './parser.js'
import { generateMockCodeReviewReport, generateMockOutput } from './adapters/openclaw.js'
import { finalReportArtifactAvailable } from './adapters/factory.js'

test('required grader verdict output is explicit and cannot be inferred as completed', () => {
  const incomplete = `## Code Review Report
### Critical
- None
### Major
- None
`
  const parsed = parseCodeReviewResult(incomplete, 'code', 'Code', 'fixture', 1, 0)
  assert.equal(parsed.verdict, 'pass')
  assert.equal(parsed.executionStatus, 'missing')
  assert.equal(hasExplicitCodeReviewVerdict(incomplete), false)
  assert.equal(hasExplicitCodeReviewVerdict('**Verdict:** PASS / CONDITIONAL / FAIL'), false)
  assert.equal(hasExplicitCodeReviewVerdict('**Verdict:** PASSING'), false)
  assert.equal(hasExplicitCodeReviewVerdict('**Verdict:** ✅ PASS'), true)
  assert.equal(
    parseCodeReviewResult('**Verdict:** ❌ FAIL', 'code', 'Code', 'fixture', 1, 0).verdict,
    'fail',
  )
  assert.equal(
    parseCodeReviewResult('**Verdict:** ⚠️ CONDITIONAL PASS', 'code', 'Code', 'fixture', 1, 0).verdict,
    'conditional',
  )
  assert.equal(hasExplicitQAVerdict('**Verdict:** ⚠️ CONDITIONAL PASS'), true)
  assert.equal(hasExplicitQAVerdict('**Verdict:** ❌ FAIL'), true)
  assert.equal(hasExplicitQAVerdict('## Verdict: PASS / CONDITIONAL PASS / FAIL'), false)
  assert.equal(hasExplicitQAVerdict('**Verdict:** FAILED'), false)
  assert.equal(hasExplicitQAVerdict('Everything appears to pass.'), false)
})

test('the execution evidence envelope is not itself a final report artifact', () => {
  const envelope = 'MAH_EVALUATION_EVIDENCE: {"explicitVerdict":"pass"}'
  assert.equal(finalReportArtifactAvailable(envelope), false)
  assert.equal(finalReportArtifactAvailable(`**Verdict:** PASS\n${envelope}`), true)
})

test('mock code review output includes a completed explicit verdict', () => {
  const output = generateMockCodeReviewReport()
  const parsed = parseCodeReviewResult(output, 'code', 'Code', 'mock', 1, 0)
  assert.equal(hasExplicitCodeReviewVerdict(output), true)
  assert.equal(parsed.verdict, 'pass')
  assert.equal(parsed.executionStatus, 'completed')
})

test('chain QA mock labels produce an explicit QA verdict', () => {
  const output = generateMockOutput('review this', 'chain-qa-awc-248-r1')
  assert.equal(hasExplicitQAVerdict(output), true)
})

test('grader parsers preserve explicit scope, release, and uncertainty provenance', () => {
  const codeReview = parseCodeReviewResult(`## Code Review Report
**Verdict:** CONDITIONAL

### Major
- [CR-07] src/current.ts:12 — Candidate activates a retry race. (Bug)
  Suggestion: serialize the transition.
  Scope relationship: activated
  Release impact: required-for-release-safety
  Evidence confidence: plausible
  Investigation question: Can two workers enter the transition?
  Exit criterion: Reproduce the race or prove the lock is exclusive.
`, 'code', 'Code', 'fixture', 1, 0)
  assert.deepEqual(
    {
      scopeRelationship: codeReview.findings[0].scopeRelationship,
      releaseImpact: codeReview.findings[0].releaseImpact,
      evidenceConfidence: codeReview.findings[0].evidenceConfidence,
      investigationQuestion: codeReview.findings[0].investigationQuestion,
      exitCriterion: codeReview.findings[0].exitCriterion,
    },
    {
      scopeRelationship: 'activated',
      releaseImpact: 'required-for-release-safety',
      evidenceConfidence: 'plausible',
      investigationQuestion: 'Can two workers enter the transition?',
      exitCriterion: 'Reproduce the race or prove the lock is exclusive.',
    },
  )

  const qa = parseQAReport(`## QA Report
## Verdict: FAIL

## Defects Found
**P1-01:** Candidate worsens keyboard navigation.
  Finding category: harness / environment
  Scope relationship: worsened
  Release impact: not-release-blocking
  Evidence confidence: confirmed
`)
  assert.equal(qa.defects[0].scopeRelationship, 'worsened')
  assert.equal(qa.defects[0].category, 'harness / environment')
  assert.equal(qa.defects[0].releaseImpact, 'not-release-blocking')
  assert.equal(qa.defects[0].evidenceConfidence, 'confirmed')
})

test('negated severity prose cannot synthesize QA defects from an explicit PASS', () => {
  for (const noDefects of [
    'No confirmed P0–P3 product defects were found.',
    'None. No P0–P3 defects identified.',
    'P0–P3: None found.',
    '**P0—P3:** None found.',
    '- P0-P3: No defects.',
  ]) {
    const qa = parseQAReport(`## QA Report
## Verdict: PASS

## Summary
The candidate satisfies the contract.

## Defects Found
${noDefects}

## Recommendation
PASS
`)
    assert.equal(qa.verdict, 'pass')
    assert.deepEqual(qa.defects, [])
  }
})

test('anchored markdown QA defect lines retain supported formats', () => {
  const qa = parseQAReport(`## Verdict: FAIL
## Defects Found
**P1-01:** First defect
- P2: Second defect
P3 — Third defect
`)
  assert.deepEqual(
    qa.defects.map(({ id, severity, description }) => ({ id, severity, description })),
    [
      { id: 'P1-01', severity: 'p1', description: 'First defect' },
      { id: 'P2-01', severity: 'p2', description: 'Second defect' },
      { id: 'P3-01', severity: 'p3', description: 'Third defect' },
    ],
  )
})
