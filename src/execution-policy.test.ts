import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_DEV_ABSOLUTE_TIMEOUT_MS,
  DEFAULT_DEV_IDLE_TIMEOUT_MS,
  boundTranscriptResponse,
  deadlineReason,
  resolveDevExecutionPolicy,
} from './execution-policy.js'

test('active output beyond the former ten-minute wall remains eligible to run', () => {
  const minute = 60_000
  const policy = {
    idleTimeoutMs: 12 * minute,
    absoluteTimeoutMs: 45 * minute,
  }
  assert.equal(
    deadlineReason(
      { startedAtMs: 0, lastActivityAtMs: 10.5 * minute },
      policy,
      11 * minute,
    ),
    null,
  )
})

test('true inactivity triggers the idle timeout', () => {
  assert.equal(
    deadlineReason(
      { startedAtMs: 0, lastActivityAtMs: 1_000 },
      { idleTimeoutMs: 12_000, absoluteTimeoutMs: 45_000 },
      13_000,
    ),
    'idle-timeout',
  )
})

test('continuous activity cannot exceed the absolute ceiling', () => {
  assert.equal(
    deadlineReason(
      { startedAtMs: 0, lastActivityAtMs: 44_999 },
      { idleTimeoutMs: 12_000, absoluteTimeoutMs: 45_000 },
      45_000,
    ),
    'absolute-timeout',
  )
})

test('development timeout policy defaults to twelve-minute idle and forty-five-minute absolute', () => {
  assert.deepEqual(resolveDevExecutionPolicy({}), {
    idleTimeoutMs: DEFAULT_DEV_IDLE_TIMEOUT_MS,
    absoluteTimeoutMs: DEFAULT_DEV_ABSOLUTE_TIMEOUT_MS,
    transcriptMaxChars: 32_000,
  })
  assert.deepEqual(resolveDevExecutionPolicy({
    execution: {
      devIdleTimeoutMinutes: 15,
      devAbsoluteTimeoutMinutes: 40,
      transcriptMaxChars: 12_000,
    },
  }), {
    idleTimeoutMs: 15 * 60_000,
    absoluteTimeoutMs: 40 * 60_000,
    transcriptMaxChars: 12_000,
  })
})

test('transcript responses are bounded while preserving useful head and tail context', () => {
  const source = `HEAD:${'x'.repeat(10_000)}:TAIL`
  const bounded = boundTranscriptResponse(source, 1_000)
  assert.equal(bounded.length, 1_000)
  assert.match(bounded, /^HEAD:/)
  assert.match(bounded, /full raw activity is stored separately/)
  assert.match(bounded, /:TAIL$/)
})
