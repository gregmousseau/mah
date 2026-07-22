import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasExplicitCodeReviewVerdict,
  parseCodeReviewResult,
} from './graders/code-review.js'
import { hasExplicitQAVerdict } from './parser.js'
import { generateMockCodeReviewReport } from './adapters/openclaw.js'

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
  assert.equal(hasExplicitQAVerdict('Everything appears to pass.'), false)
})

test('mock code review output includes a completed explicit verdict', () => {
  const output = generateMockCodeReviewReport()
  const parsed = parseCodeReviewResult(output, 'code', 'Code', 'mock', 1, 0)
  assert.equal(hasExplicitCodeReviewVerdict(output), true)
  assert.equal(parsed.verdict, 'pass')
  assert.equal(parsed.executionStatus, 'completed')
})
