import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasExplicitCodeReviewVerdict,
  parseCodeReviewResult,
} from './graders/code-review.js'
import { hasExplicitQAVerdict } from './parser.js'

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
  assert.equal(hasExplicitQAVerdict('**Verdict:** ⚠️ CONDITIONAL PASS'), true)
  assert.equal(hasExplicitQAVerdict('**Verdict:** ❌ FAIL'), true)
  assert.equal(hasExplicitQAVerdict('Everything appears to pass.'), false)
})
