import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import type { GraderFinding } from './types.js'
import { classifyFinding } from './registrar/classify.js'
import { sanitizeEvidence } from './registrar/redact.js'
import { buildTicketActions, ticketFingerprint } from './registrar/ticket.js'
import {
  DEFAULT_REGISTRAR_CONFIG,
  registerFindings,
  registerFromGraderResults,
  registrarBlockers,
  safeRegisterFindings,
  writeRegistrarReport,
} from './registrar/registrar.js'
import type { FindingPacket, RegistrarConfig } from './registrar/types.js'

interface Fixture {
  name: string
  candidateSha: string
  currentPrPaths: string[]
  findings: GraderFinding[]
}

function readFixture(name: string): Fixture {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'src', '__fixtures__', 'registrar', `${name}.json`),
      'utf8',
    ),
  )
}

test('defaults for the shadow rollout are advisory + report-only, ticket dispatch disabled', () => {
  assert.equal(DEFAULT_REGISTRAR_CONFIG.scopeGate, 'advisory')
  assert.equal(DEFAULT_REGISTRAR_CONFIG.findingsMode, 'report')
  assert.equal(DEFAULT_REGISTRAR_CONFIG.ticketDispatchEnabled, false)
})

test('golden classification: PR-scoped major → current-pr-blocker; adjacent minor → follow-up', () => {
  const config = { currentPrPaths: ['src/a.ts'] } as Pick<
    RegistrarConfig,
    'currentPrPaths' | 'falsePositiveIds'
  >
  const inScope = classifyFinding(
    { id: 'X', severity: 'major', category: 'bug', file: 'src/a.ts', description: 'x' },
    config,
  )
  assert.equal(inScope.classification, 'current-pr-blocker')
  assert.equal(inScope.provenance.inRepairScope, true)

  const adjacent = classifyFinding(
    { id: 'Y', severity: 'minor', category: 'bug', file: 'src/b.ts', description: 'y' },
    config,
  )
  assert.equal(adjacent.classification, 'follow-up')
  assert.equal(adjacent.provenance.inRepairScope, false)
})

test('harness/infra categories always classify as harness-defect', () => {
  const packet = classifyFinding(
    { id: 'H1', severity: 'critical', category: 'harness', description: 'infra broke' },
    { currentPrPaths: ['src/a.ts'] },
  )
  assert.equal(packet.classification, 'harness-defect')
})

test('deterministic false-positive allowlist wins over severity', () => {
  const packet = classifyFinding(
    { id: 'FP-1', severity: 'critical', category: 'bug', file: 'src/a.ts', description: 'x' },
    { currentPrPaths: ['src/a.ts'], falsePositiveIds: ['FP-1'] },
  )
  assert.equal(packet.classification, 'false-positive')
})

test('registrar in shadow mode returns packets, records adjacency, mutates nothing external', () => {
  const fixture = readFixture('awc-241-scope')
  const report = registerFindings(
    { candidateSha: fixture.candidateSha, findings: fixture.findings, graderId: 'code' },
    { currentPrPaths: fixture.currentPrPaths },
  )
  assert.equal(report.findingsMode, 'report')
  assert.equal(report.scopeGate, 'advisory')
  assert.equal(report.ticketDispatchEnabled, false)
  assert.equal(report.candidateSha, fixture.candidateSha)

  const blocker = report.currentBlockers.find((p) => p.originFindingId === 'CR-01')
  assert.ok(blocker, 'CR-01 must remain a current-PR blocker')
  assert.equal(blocker!.severity, 'major')
  assert.equal(blocker!.scopeProvenance.inRepairScope, true)

  const adjacentDoc = report.packets.find((p) => p.originFindingId === 'CR-03')!
  assert.notEqual(adjacentDoc.classification, 'current-pr-blocker')

  // Ticket actions exist in report mode but explicitly are not dispatched.
  for (const action of report.ticketActions) {
    assert.equal(action.dispatched, false)
    assert.equal(action.targetState, 'Todo')
    assert.equal(action.reason, 'ticket-mode-disabled')
  }
})

test('advisory scopeGate never emits registrarBlockers', () => {
  const fixture = readFixture('awc-241-scope')
  const report = registerFindings(
    { candidateSha: fixture.candidateSha, findings: fixture.findings },
    { currentPrPaths: fixture.currentPrPaths, scopeGate: 'advisory' },
  )
  assert.equal(registrarBlockers(report).length, 0)
})

test('enforced scopeGate surfaces current-PR blockers to the caller', () => {
  const fixture = readFixture('awc-241-scope')
  const report = registerFindings(
    { candidateSha: fixture.candidateSha, findings: fixture.findings },
    { currentPrPaths: fixture.currentPrPaths, scopeGate: 'enforced' },
  )
  const blockers = registrarBlockers(report)
  assert.ok(blockers.some((p) => p.originFindingId === 'CR-01'))
})

test('enforced scopeGate keeps repair-scoped registrar fallback visible', () => {
  const poison = {
    id: 'poison',
    severity: 'major' as const,
    get category(): string {
      throw new Error('unreadable category')
    },
    file: 'src/pipeline.ts',
    description: 'Potential release blocker.',
  }
  const report = registerFindings(
    { candidateSha: 'a'.repeat(40), findings: [poison] },
    { scopeGate: 'enforced' },
  )
  assert.equal(report.errors.length, 1)
  assert.equal(registrarBlockers(report).length, 1)
  assert.equal(registrarBlockers(report)[0].classification, 'harness-defect')
})

test('findingsMode="off" short-circuits with an empty report — even with input', () => {
  const fixture = readFixture('awc-241-scope')
  const report = registerFindings(
    { candidateSha: fixture.candidateSha, findings: fixture.findings },
    { findingsMode: 'off' },
  )
  assert.deepEqual(report.packets, [])
  assert.deepEqual(report.ticketActions, [])
  assert.deepEqual(report.errors, [])
})

test('historical AWC-194 replay: harness + adjacent findings do not become current-PR blockers', () => {
  const fixture = readFixture('awc-194-harness')
  const report = registerFindings(
    { candidateSha: fixture.candidateSha, findings: fixture.findings },
    { currentPrPaths: fixture.currentPrPaths },
  )
  assert.equal(report.currentBlockers.length, 0, 'no genuine current-PR blocker in this replay')
  const harness = report.packets.find((p) => p.originFindingId === 'HRN-01')!
  assert.equal(harness.classification, 'harness-defect')
  const adjacent = report.packets.find((p) => p.originFindingId === 'AJC-02')!
  assert.notEqual(adjacent.classification, 'current-pr-blocker')
  const fp = report.packets.find((p) => p.originFindingId === 'FP-03')!
  assert.doesNotMatch(fp.sanitizedEvidence, /<jane-raw>/)
})

test('deduplication: identical findings collapse to one ticket action per run and skip existing tickets', () => {
  const fixture = readFixture('awc-241-scope')
  const report = registerFindings(
    { candidateSha: fixture.candidateSha, findings: [...fixture.findings, ...fixture.findings] },
    { currentPrPaths: fixture.currentPrPaths, findingsMode: 'ticket', ticketDispatchEnabled: false },
  )
  const fingerprints = report.ticketActions.map((a) => a.fingerprint)
  const unique = new Set(fingerprints)
  for (const fp of unique) {
    const collapsed = fingerprints.filter((f) => f === fp).length
    assert.ok(collapsed <= 2, 'duplicates within a run are marked as duplicate')
  }
  const anyDuplicate = report.ticketActions.some((a) => a.reason === 'duplicate')
  assert.ok(anyDuplicate)

  const withExisting = registerFindings(
    { candidateSha: fixture.candidateSha, findings: fixture.findings },
    {
      currentPrPaths: fixture.currentPrPaths,
      findingsMode: 'ticket',
      ticketDispatchEnabled: false,
      existingTicketFingerprints: [ticketFingerprint(report.adjacent[0])],
    },
  )
  assert.ok(withExisting.ticketActions.some((a) => a.reason === 'duplicate'))
})

test('privacy: sanitization strips bearer tokens, AWS keys, cookies, emails, PHI markers', () => {
  const fixture = readFixture('redaction-probe')
  const report = registerFindings(
    { candidateSha: fixture.candidateSha, findings: fixture.findings },
    { currentPrPaths: fixture.currentPrPaths, findingsMode: 'ticket' },
  )
  const packet = report.packets[0]
  assert.doesNotMatch(packet.sanitizedEvidence, /Bearer\s+sk-/)
  assert.doesNotMatch(packet.sanitizedEvidence, /AKIA[0-9A-Z]{16}/)
  assert.doesNotMatch(packet.sanitizedEvidence, /cookie:\s+session/)
  assert.doesNotMatch(packet.sanitizedEvidence, /fake@example\.com/)
  assert.doesNotMatch(packet.sanitizedEvidence, /555-123-4567/)
  assert.doesNotMatch(packet.sanitizedEvidence, /<jane-raw>/)
  assert.doesNotMatch(packet.proposedDisposition, /AKIA[0-9A-Z]{16}/)
})

test('sanitizeEvidence is idempotent (retry/idempotency contract)', () => {
  const raw = 'token=Bearer sk-testtesttesttesttesttest email=x@example.com'
  const once = sanitizeEvidence(raw)
  const twice = sanitizeEvidence(once)
  assert.equal(once, twice)
})

test('packet id and ticket fingerprint are deterministic across runs (idempotent registration)', () => {
  const fixture = readFixture('awc-241-scope')
  const a = registerFindings(
    { candidateSha: fixture.candidateSha, findings: fixture.findings },
    { currentPrPaths: fixture.currentPrPaths, findingsMode: 'ticket' },
  )
  const b = registerFindings(
    { candidateSha: fixture.candidateSha, findings: fixture.findings },
    { currentPrPaths: fixture.currentPrPaths, findingsMode: 'ticket' },
  )
  assert.deepEqual(
    a.packets.map((p) => p.packetId),
    b.packets.map((p) => p.packetId),
  )
  assert.deepEqual(
    a.ticketActions.map((t) => t.fingerprint),
    b.ticketActions.map((t) => t.fingerprint),
  )
})

test('crash/recovery: a poison finding does not hide surrounding current-PR blockers', () => {
  const poison: GraderFinding = {
    id: 'POISON',
    severity: 'major',
    category: 'bug',
    file: 'src/a.ts',
    description: 'x',
  }
  // Sabotage classification by handing an object whose category getter throws.
  const throwing = new Proxy(poison, {
    get(target, prop) {
      if (prop === 'category') throw new Error('poison category access')
      return (target as unknown as Record<string | symbol, unknown>)[prop as string]
    },
  })
  const genuineBlocker: GraderFinding = {
    id: 'REAL',
    severity: 'critical',
    category: 'bug',
    file: 'src/a.ts',
    description: 'real blocker',
  }
  const report = registerFindings(
    { candidateSha: '0'.repeat(40), findings: [throwing, genuineBlocker] },
    { currentPrPaths: ['src/a.ts'], scopeGate: 'enforced' },
  )
  assert.ok(report.errors.length >= 1, 'poison error is recorded')
  assert.ok(
    report.packets.some((p) => p.originFindingId === 'REAL' && p.classification === 'current-pr-blocker'),
    'the genuine blocker still classified as a current-PR blocker',
  )
  // The poison itself becomes a fallback packet — it does not disappear.
  assert.ok(report.packets.some((p) => p.originFindingId === 'POISON'))
})

test('safeRegisterFindings never throws — even on a totally malformed input', () => {
  const report = safeRegisterFindings({
    candidateSha: 'x',
    // deliberately malformed to walk the outer catch
    findings: undefined as unknown as GraderFinding[],
  })
  assert.ok(Array.isArray(report.errors))
  assert.equal(report.candidateSha, 'x')
})

test('stale candidate: mismatched candidate SHA between input and packet output surfaces cleanly', () => {
  const fresh = registerFindings(
    { candidateSha: 'a'.repeat(40), findings: [{
      id: 'S1', severity: 'major', category: 'bug', file: 'src/a.ts', description: 'stale',
    }] },
    { currentPrPaths: ['src/a.ts'] },
  )
  const stale = registerFindings(
    { candidateSha: 'b'.repeat(40), findings: [{
      id: 'S1', severity: 'major', category: 'bug', file: 'src/a.ts', description: 'stale',
    }] },
    { currentPrPaths: ['src/a.ts'] },
  )
  assert.notEqual(fresh.packets[0].packetId, stale.packets[0].packetId)
  for (const packet of stale.packets) {
    assert.equal(packet.candidateSha, 'b'.repeat(40))
  }
})

test('no external mutation: registrar does not open network sockets or write outside caller-provided paths', () => {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async (...args: unknown[]) => {
    fetchCalls += 1
    throw new Error(`registrar must not fetch: args=${JSON.stringify(args).slice(0, 60)}`)
  }) as typeof fetch
  try {
    const fixture = readFixture('awc-241-scope')
    registerFindings(
      { candidateSha: fixture.candidateSha, findings: fixture.findings },
      {
        currentPrPaths: fixture.currentPrPaths,
        findingsMode: 'ticket',
        ticketDispatchEnabled: true, // even with dispatch on, this module never fetches
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(fetchCalls, 0)
})

test('writeRegistrarReport writes a structured JSON file at the caller path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mah-249-report-'))
  const out = join(dir, 'report.json')
  const fixture = readFixture('awc-241-scope')
  const report = registerFindings(
    { candidateSha: fixture.candidateSha, findings: fixture.findings },
    { currentPrPaths: fixture.currentPrPaths },
  )
  writeRegistrarReport(report, out)
  assert.ok(existsSync(out))
  const parsed = JSON.parse(readFileSync(out, 'utf8'))
  assert.equal(parsed.candidateSha, fixture.candidateSha)
  assert.equal(parsed.findingsMode, 'report')
})

test('registerFromGraderResults wraps a grader-shaped result set into the registrar', () => {
  const report = registerFromGraderResults(
    '0'.repeat(40),
    [
      {
        graderId: 'code',
        graderType: 'code-review',
        graderName: 'Code',
        verdict: 'fail',
        summary: 's',
        model: 'x',
        durationMs: 0,
        costEstimate: 0,
        findings: [
          { id: 'C1', severity: 'major', category: 'bug', file: 'src/a.ts', description: 'x' },
        ],
      },
    ],
    { currentPrPaths: ['src/a.ts'] },
  )
  assert.equal(report.packets[0].scopeProvenance.sourceGraderId, 'code')
  assert.equal(report.packets[0].classification, 'current-pr-blocker')
})

test('ticket mode with dispatch disabled marks every action as shadow-only, never ready', () => {
  const fixture = readFixture('awc-241-scope')
  const report = registerFindings(
    { candidateSha: fixture.candidateSha, findings: fixture.findings },
    {
      currentPrPaths: fixture.currentPrPaths,
      findingsMode: 'ticket',
      ticketDispatchEnabled: false,
    },
  )
  for (const action of report.ticketActions) {
    assert.notEqual(action.reason, 'ready')
    assert.equal(action.dispatched, false)
  }
})

test('config validation rejects unsupported scopeGate/findingsMode values', () => {
  assert.throws(
    () => registerFindings(
      { candidateSha: 'x', findings: [] },
      { scopeGate: 'permissive' as unknown as RegistrarConfig['scopeGate'] },
    ),
    /scopeGate/,
  )
  assert.throws(
    () => registerFindings(
      { candidateSha: 'x', findings: [] },
      { findingsMode: 'always' as unknown as RegistrarConfig['findingsMode'] },
    ),
    /findingsMode/,
  )
})

test('ticket builder skips current-pr-blockers and false-positives', () => {
  const packets: FindingPacket[] = [
    fakePacket('P1', 'current-pr-blocker'),
    fakePacket('P2', 'follow-up'),
    fakePacket('P3', 'false-positive'),
    fakePacket('P4', 'spike-candidate'),
  ]
  const actions = buildTicketActions(packets, { findingsMode: 'ticket', ticketDispatchEnabled: false })
  const originIds = actions.map((a) => a.packetId).sort()
  assert.deepEqual(originIds, ['pkt-P2', 'pkt-P4'])
})

function fakePacket(id: string, classification: FindingPacket['classification']): FindingPacket {
  return {
    packetId: `pkt-${id}`,
    candidateSha: '0'.repeat(40),
    classification,
    severity: 'major',
    scopeProvenance: { reason: 'test', inRepairScope: classification === 'current-pr-blocker' },
    sanitizedEvidence: 'evidence',
    risk: 'risk',
    reproduction: 'repro',
    proposedDisposition: 'disposition',
    originFindingId: id,
    createdAt: 'awc249-fake',
  }
}
