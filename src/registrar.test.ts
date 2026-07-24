import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import type { GraderFinding } from './types.js'
import { classifyFinding } from './registrar/classify.js'
import { sanitizeEvidence } from './registrar/redact.js'
import { buildTicketActions, ticketFingerprint } from './registrar/ticket.js'
import { dispatchFindingTickets } from './registrar/dispatch.js'
import { processScopeAwareFindingRound } from './registrar/round.js'
import {
  LinearIssueCreateNotAttemptedError,
  type LinearTicket,
} from './integrations/linear.js'
import {
  repairScopedGraderResults,
  scopeAwareVerdict,
} from './registrar/routing.js'
import { buildConsolidatedRepairBrief } from './reliability.js'
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

test('scope provenance, not severity, determines blocker vs follow-up vs spike', () => {
  const config = { currentPrPaths: ['src/touched.ts'] }
  const introducedMinor = classifyFinding({
    id: 'INTRODUCED',
    severity: 'minor',
    category: 'bug',
    file: 'src/adjacent.ts',
    description: 'Candidate regression.',
    scopeRelationship: 'introduced',
    releaseImpact: 'not-release-blocking',
    evidenceConfidence: 'confirmed',
  }, config)
  const preExistingCritical = classifyFinding({
    id: 'OLD',
    severity: 'critical',
    category: 'bug',
    file: 'src/touched.ts',
    description: 'Old defect.',
    scopeRelationship: 'pre-existing',
    releaseImpact: 'not-release-blocking',
    evidenceConfidence: 'confirmed',
  }, config)
  const releaseSafetyMinor = classifyFinding({
    id: 'SAFETY',
    severity: 'minor',
    category: 'bug',
    file: 'src/adjacent.ts',
    description: 'Release safety requirement.',
    scopeRelationship: 'pre-existing',
    releaseImpact: 'required-for-release-safety',
    evidenceConfidence: 'confirmed',
  }, config)
  const uncertain = classifyFinding({
    id: 'UNCERTAIN',
    severity: 'major',
    category: 'bug',
    file: 'src/adjacent.ts',
    description: 'Plausible risk.',
    scopeRelationship: 'unknown',
    releaseImpact: 'unknown',
    evidenceConfidence: 'insufficient',
  }, config)
  const confirmedImprovement = classifyFinding({
    id: 'IMPROVEMENT',
    severity: 'info',
    category: 'improvement',
    file: 'src/adjacent.ts',
    description: 'Confirmed adjacent improvement.',
    scopeRelationship: 'unknown',
    releaseImpact: 'not-release-blocking',
    evidenceConfidence: 'confirmed',
  }, config)
  const plausiblePreExistingRisk = classifyFinding({
    id: 'PLAUSIBLE-OLD',
    severity: 'major',
    category: 'bug',
    file: 'src/adjacent.ts',
    description: 'Plausible pre-existing risk.',
    scopeRelationship: 'pre-existing',
    releaseImpact: 'not-release-blocking',
    evidenceConfidence: 'plausible',
  }, config)

  assert.equal(introducedMinor.classification, 'current-pr-blocker')
  assert.equal(preExistingCritical.classification, 'follow-up')
  assert.equal(releaseSafetyMinor.classification, 'current-pr-blocker')
  assert.equal(uncertain.classification, 'spike-candidate')
  assert.equal(confirmedImprovement.classification, 'follow-up')
  assert.equal(plausiblePreExistingRisk.classification, 'spike-candidate')
})

test('harness/infra categories always classify as harness-defect', () => {
  for (const category of [
    'harness',
    'environment',
    'credentials',
    'preflight',
    'evaluation',
    'tooling',
  ]) {
    const packet = classifyFinding(
      { id: category, severity: 'critical', category, description: 'infra broke' },
      { currentPrPaths: ['src/a.ts'] },
    )
    assert.equal(packet.classification, 'harness-defect')
  }
  assert.equal(classifyFinding(
    {
      id: 'combined',
      severity: 'major',
      category: 'harness / environment',
      description: 'Browser setup failed.',
    },
    { currentPrPaths: ['src/a.ts'] },
  ).classification, 'harness-defect')
})

test('confirmed design improvements remain follow-ups instead of becoming spikes by label', () => {
  const classified = classifyFinding({
    id: 'DESIGN',
    severity: 'minor',
    category: 'architecture',
    file: 'src/adjacent.ts',
    description: 'Confirmed adjacent simplification.',
    scopeRelationship: 'pre-existing',
    releaseImpact: 'not-release-blocking',
    evidenceConfidence: 'confirmed',
  }, { currentPrPaths: ['src/current.ts'] })
  assert.equal(classified.classification, 'follow-up')
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
  assert.doesNotThrow(() => new Date(report.generatedAt).toISOString())

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

test('enforced scopeGate routes registrar fallback as a fail-closed harness defect', () => {
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
  assert.equal(registrarBlockers(report).length, 0)
  assert.equal(report.harnessDefects[0].classification, 'harness-defect')
  assert.equal(scopeAwareVerdict('pass', [], [], report), 'fail')
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

  const mutable = registerFindings(
    { candidateSha: 'a'.repeat(40), findings: [] },
    { findingsMode: 'off' },
  )
  mutable.errors.push('mutated')
  mutable.packets.push(fakePacket('MUTATED', 'follow-up'))
  const next = registerFindings(
    { candidateSha: 'b'.repeat(40), findings: [] },
    { findingsMode: 'off' },
  )
  assert.deepEqual(next.errors, [])
  assert.deepEqual(next.packets, [])
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
  assert.deepEqual(report.harnessDefects.map((p) => p.originFindingId), ['HRN-01'])
  assert.ok(!report.adjacent.some((p) => p.originFindingId === 'HRN-01'))
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
      ticketTeamId: 'team-a',
      existingTicketFingerprints: [{
        teamId: 'team-a',
        fingerprint: ticketFingerprint(report.adjacent[0]),
      }],
    },
  )
  assert.ok(withExisting.ticketActions.some((a) => a.reason === 'duplicate'))
})

test('deduplication ignores fingerprints exported from another Linear team', () => {
  const finding: GraderFinding = {
    id: 'TEAM-SCOPE',
    severity: 'major',
    category: 'bug',
    file: 'adjacent.ts',
    description: 'team-scoped root cause',
    scopeRelationship: 'pre-existing',
    releaseImpact: 'not-release-blocking',
    evidenceConfidence: 'confirmed',
  }
  const baseline = registerFindings({
    candidateSha: '0'.repeat(40),
    findings: [finding],
  }, {
    currentPrPaths: ['current.ts'],
    findingsMode: 'ticket',
    ticketDispatchEnabled: false,
    ticketTeamId: 'team-a',
  })
  const report = registerFindings({
    candidateSha: '0'.repeat(40),
    findings: [finding],
  }, {
    currentPrPaths: ['current.ts'],
    findingsMode: 'ticket',
    ticketDispatchEnabled: false,
    ticketTeamId: 'team-a',
    existingTicketFingerprints: [{
      teamId: 'team-b',
      fingerprint: baseline.ticketActions[0].fingerprint,
    }],
  })

  assert.equal(report.ticketActions[0].reason, 'shadow-only')
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

test('privacy: sanitization strips credentials and PHI behind quoted JSON keys', () => {
  const sanitized = sanitizeEvidence(JSON.stringify({
    password: 'hunter2',
    api_key: 'super-secret-value',
    dob: '1980-01-01',
    mrn: 'MRN-12345',
  }))

  assert.doesNotMatch(sanitized, /hunter2/)
  assert.doesNotMatch(sanitized, /super-secret-value/)
  assert.doesNotMatch(sanitized, /1980-01-01/)
  assert.doesNotMatch(sanitized, /MRN-12345/)
})

test('privacy: every persisted and ticket-dispatched field is sanitized', () => {
  const report = registerFindings({
    candidateSha: '0'.repeat(40),
    graderId: 'member_name: John Smith',
    findings: [{
      id: 'patient_name=Jane Doe',
      severity: 'info',
      category: 'password=hunter2',
      file: 'api_key=super-secret-value',
      description:
        'Patient Alice Jones lives at 123 Main Street on 1980-01-01; api_key=raw-secret.',
      suggestion: 'password=another-secret',
      scopeRelationship: 'unknown',
      releaseImpact: 'unknown',
      evidenceConfidence: 'insufficient',
      investigationQuestion: 'Did Alice Jones use token=plain-secret?',
      exitCriterion: 'Confirm member_name: Alice Jones is removed.',
    }],
  }, {
    currentPrPaths: ['src/current.ts'],
    findingsMode: 'ticket',
  })
  const dir = mkdtempSync(join(tmpdir(), 'mah-249-private-'))
  const out = join(dir, 'report.json')
  writeRegistrarReport(report, out)
  const persisted = readFileSync(out, 'utf8')
  const externallyVisible = `${persisted}\n${report.ticketActions.map((action) =>
    `${action.title}\n${action.body}`).join('\n')}`

  for (const secret of [
    'John Smith',
    'Jane Doe',
    'Alice Jones',
    'hunter2',
    'super-secret-value',
    'raw-secret',
    'another-secret',
    'plain-secret',
    '123 Main Street',
    '1980-01-01',
  ]) {
    assert.doesNotMatch(
      externallyVisible,
      new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    )
  }
})

test('privacy: untagged Gmail and Jane provider content is redacted deterministically', () => {
  const gmail = [
    'From: member@synthetic.invalid',
    'To: clinic@synthetic.invalid',
    'Subject: synthetic request',
    'Message-ID: synthetic-message-id',
    '',
    'opaque-private-gmail-text',
  ].join('\n')
  const jane = JSON.stringify({
    patient_id: 'synthetic-patient',
    appointment_note: 'opaque-private-jane-text',
  })
  const report = registerFindings({
    candidateSha: '0'.repeat(40),
    findings: [
      {
        id: 'GMAIL-RAW',
        severity: 'minor',
        category: 'privacy',
        file: 'src/gmail.ts',
        description: gmail,
        scopeRelationship: 'pre-existing',
        releaseImpact: 'not-release-blocking',
        evidenceConfidence: 'confirmed',
      },
      {
        id: 'JANE-RAW',
        severity: 'minor',
        category: 'privacy',
        file: 'src/jane.ts',
        description: jane,
        scopeRelationship: 'pre-existing',
        releaseImpact: 'not-release-blocking',
        evidenceConfidence: 'confirmed',
      },
    ],
  }, {
    currentPrPaths: ['src/current.ts'],
    findingsMode: 'ticket',
  })
  const dir = mkdtempSync(join(tmpdir(), 'mah-249-untagged-private-'))
  const out = join(dir, 'report.json')
  writeRegistrarReport(report, out)
  const externallyVisible = [
    readFileSync(out, 'utf8'),
    ...report.ticketActions.map((action) => `${action.title}\n${action.body}`),
  ].join('\n')

  assert.doesNotMatch(externallyVisible, /opaque-private-(?:gmail|jane)-text/)
  assert.equal(report.packets[0].sanitizedEvidence, '[REDACTED:raw-email-message]')
  assert.equal(report.packets[1].sanitizedEvidence, '[REDACTED:jane-api-payload]')
  assert.equal(
    sanitizeEvidence(report.packets[0].sanitizedEvidence),
    report.packets[0].sanitizedEvidence,
  )
})

test('privacy: persistence redacts untagged provider fields at the final boundary', () => {
  const report = registerFindings({
    candidateSha: '0'.repeat(40),
    findings: [],
  })
  const synthetic = report as unknown as Record<string, unknown>
  synthetic.gmailMessageBody = 'opaque-private-gmail-field'
  synthetic.janeApiResponse = {
    clinicalNarrative: 'opaque-private-jane-field',
  }
  const dir = mkdtempSync(join(tmpdir(), 'mah-249-provider-private-'))
  const out = join(dir, 'report.json')

  writeRegistrarReport(report, out)
  const persisted = readFileSync(out, 'utf8')

  assert.doesNotMatch(persisted, /opaque-private-(?:gmail|jane)-field/)
  assert.match(persisted, /\[REDACTED:sensitive-provider-content\]/)
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

test('multi-grader registration preserves each finding source', () => {
  const base = {
    graderType: 'custom', graderName: 'g', verdict: 'fail' as const,
    summary: 's', model: 'm', durationMs: 0, costEstimate: 0,
  }
  const report = registerFromGraderResults('0'.repeat(40), [
    { ...base, graderId: 'one', findings: [{ id: 'A', severity: 'minor', category: 'bug', file: 'a', description: 'a' }] },
    { ...base, graderId: 'two', findings: [{ id: 'B', severity: 'minor', category: 'bug', file: 'b', description: 'b' }] },
  ], { currentPrPaths: ['z'] })
  assert.deepEqual(report.packets.map((packet) => packet.scopeProvenance.sourceGraderId), ['one', 'two'])
})

test('enforced scope preserves non-pass when registration is off, errored, or incomplete', () => {
  const result = {
    graderId: 'code', graderType: 'code-review', graderName: 'Code', verdict: 'fail' as const,
    summary: 'blocked', model: 'm', durationMs: 0, costEstimate: 0,
    findings: [{ id: 'B', severity: 'major' as const, category: 'bug', file: 'src/a.ts', description: 'blocker' }],
  }
  const off = registerFindings(
    { candidateSha: '0'.repeat(40), findings: result.findings },
    { scopeGate: 'enforced', findingsMode: 'off' },
  )
  assert.equal(scopeAwareVerdict('fail', [result], [], off), 'fail')
  const errored = { ...off, findingsMode: 'report' as const, errors: ['aborted'] }
  assert.equal(scopeAwareVerdict('fail', [result], [], errored), 'fail')
  assert.deepEqual(repairScopedGraderResults([result], errored), [result])
})

test('enforced scope fails closed when an unchanged critical finding lacks scope metadata', () => {
  const results = [{
    graderId: 'code',
    graderType: 'code-review',
    graderName: 'Code',
    verdict: 'fail' as const,
    summary: 'Critical finding without provenance.',
    model: 'm',
    durationMs: 0,
    costEstimate: 0,
    findings: [{
      id: 'CRITICAL-UNSCOPED',
      severity: 'critical' as const,
      category: 'bug',
      file: 'src/unchanged.ts',
      description: 'A critical failure cannot be scoped safely.',
    }],
  }]
  const report = registerFromGraderResults('0'.repeat(40), results, {
    currentPrPaths: ['src/current.ts'],
    scopeGate: 'enforced',
  })

  assert.equal(report.adjacent[0].classification, 'follow-up')
  assert.equal(report.reviewComplete, false)
  assert.match(report.errors.join('\n'), /Scope metadata incomplete/)
  assert.equal(scopeAwareVerdict('fail', results, [], report), 'fail')
  assert.deepEqual(repairScopedGraderResults(results, report), results)
})

test('fingerprints merge equivalent root causes across IDs and separate unrelated evidence', () => {
  const a = fakePacket('ID-A', 'follow-up')
  const b = { ...fakePacket('ID-B', 'follow-up'), originFindingId: 'different-id' }
  const reclassified = { ...fakePacket('ID-C', 'spike-candidate'), originFindingId: 'reclassified' }
  const c = { ...fakePacket('ID-A', 'follow-up'), sanitizedEvidence: 'unrelated root cause' }
  assert.equal(ticketFingerprint(a), ticketFingerprint(b))
  assert.equal(ticketFingerprint(a), ticketFingerprint(reclassified))
  assert.notEqual(ticketFingerprint(a), ticketFingerprint(c))
})

test('spike fingerprints keep identical evidence distinct across source files', () => {
  const report = registerFindings({
    candidateSha: '0'.repeat(40),
    findings: [
      {
        id: 'SPIKE-A',
        severity: 'major',
        category: 'architecture',
        file: 'src/a.ts',
        description: 'Investigate the shared failure mode.',
        evidenceConfidence: 'plausible',
      },
      {
        id: 'SPIKE-B',
        severity: 'major',
        category: 'architecture',
        file: 'src/b.ts',
        description: 'Investigate the shared failure mode.',
        evidenceConfidence: 'plausible',
      },
    ],
  }, {
    currentPrPaths: ['src/current.ts'],
    findingsMode: 'ticket',
  })

  assert.deepEqual(
    report.packets.map((packet) => packet.scopeProvenance.matchedPath),
    ['src/a.ts', 'src/b.ts'],
  )
  assert.notEqual(
    report.ticketActions[0].fingerprint,
    report.ticketActions[1].fingerprint,
  )
  assert.notEqual(report.ticketActions[1].reason, 'duplicate')
})

test('enforced routing keeps only current-PR blockers in the repair brief', () => {
  const results = [
    {
      graderId: 'code',
      graderType: 'code-review',
      graderName: 'Code',
      verdict: 'fail' as const,
      summary: 'mixed findings',
      model: 'm',
      durationMs: 0,
      costEstimate: 0,
      findings: [
        {
          id: 'SHARED',
          severity: 'major' as const,
          category: 'bug',
          file: 'src/current.ts',
          description: 'Current candidate regression.',
          scopeRelationship: 'introduced' as const,
          releaseImpact: 'not-release-blocking' as const,
          evidenceConfidence: 'confirmed' as const,
        },
      ],
    },
    {
      graderId: 'ux',
      graderType: 'ux',
      graderName: 'UX',
      verdict: 'fail' as const,
      summary: 'adjacent finding',
      model: 'm',
      durationMs: 0,
      costEstimate: 0,
      findings: [
        {
          id: 'SHARED',
          severity: 'major' as const,
          category: 'bug',
          file: 'src/adjacent.ts',
          description: 'Pre-existing adjacent regression.',
          scopeRelationship: 'pre-existing' as const,
          releaseImpact: 'not-release-blocking' as const,
          evidenceConfidence: 'confirmed' as const,
        },
      ],
    },
  ]
  const report = registerFromGraderResults('0'.repeat(40), results, {
    currentPrPaths: ['src/current.ts'],
    scopeGate: 'enforced',
  })
  const scoped = repairScopedGraderResults(results, report)
  const brief = buildConsolidatedRepairBrief(scoped)

  assert.equal(scopeAwareVerdict('fail', results, [], report), 'fail')
  assert.match(brief, /Current candidate regression/)
  assert.doesNotMatch(brief, /Pre-existing adjacent regression/)
  assert.equal(scoped[1].verdict, 'pass')
})

test('an adjacent-only material finding leaves the enforced repair loop', () => {
  const results = [{
    graderId: 'code',
    graderType: 'code-review',
    graderName: 'Code',
    verdict: 'conditional' as const,
    summary: 'adjacent only',
    model: 'm',
    durationMs: 0,
    costEstimate: 0,
    findings: [{
      id: 'ADJ',
      severity: 'major' as const,
      category: 'bug',
      file: 'src/adjacent.ts',
      description: 'Adjacent product defect.',
      scopeRelationship: 'pre-existing' as const,
      releaseImpact: 'not-release-blocking' as const,
      evidenceConfidence: 'confirmed' as const,
    }],
  }]
  const report = registerFromGraderResults('0'.repeat(40), results, {
    currentPrPaths: ['src/current.ts'],
    scopeGate: 'enforced',
  })
  const scoped = repairScopedGraderResults(results, report)

  assert.equal(report.adjacent[0].classification, 'follow-up')
  assert.equal(scopeAwareVerdict('fail', results, [], report), 'pass')
  assert.deepEqual(scoped[0].findings, [])
  assert.equal(scoped[0].verdict, 'pass')
})

test('routing distinguishes duplicate finding IDs within one grader', () => {
  const results = [{
    graderId: 'code',
    graderType: 'code-review',
    graderName: 'Code',
    verdict: 'fail' as const,
    summary: 'Duplicate IDs from malformed grader output.',
    model: 'm',
    durationMs: 0,
    costEstimate: 0,
    findings: [
      {
        id: 'CR-01',
        severity: 'major' as const,
        category: 'bug',
        file: 'src/current.ts',
        description: 'Candidate regression.',
        scopeRelationship: 'introduced' as const,
        releaseImpact: 'not-release-blocking' as const,
        evidenceConfidence: 'confirmed' as const,
      },
      {
        id: 'CR-01',
        severity: 'major' as const,
        category: 'bug',
        file: 'src/adjacent.ts',
        description: 'Adjacent pre-existing defect.',
        scopeRelationship: 'pre-existing' as const,
        releaseImpact: 'not-release-blocking' as const,
        evidenceConfidence: 'confirmed' as const,
      },
    ],
  }]
  const report = registerFromGraderResults('0'.repeat(40), results, {
    currentPrPaths: ['src/current.ts'],
    scopeGate: 'enforced',
  })
  const scoped = repairScopedGraderResults(results, report)
  assert.deepEqual(scoped[0].findings.map((finding) => finding.description), [
    'Candidate regression.',
  ])
})

test('mismatched packet identity makes scope review incomplete and preserves original repair data', () => {
  const results = [{
    graderId: 'code',
    graderType: 'code-review',
    graderName: 'Code',
    verdict: 'conditional' as const,
    summary: 'Adjacent.',
    model: 'm',
    durationMs: 0,
    costEstimate: 0,
    findings: [{
      id: 'ADJ',
      severity: 'major' as const,
      category: 'bug',
      file: 'src/adjacent.ts',
      description: 'Adjacent defect.',
      scopeRelationship: 'pre-existing' as const,
      releaseImpact: 'not-release-blocking' as const,
      evidenceConfidence: 'confirmed' as const,
    }],
  }]
  const report = registerFromGraderResults('0'.repeat(40), results, {
    currentPrPaths: ['src/current.ts'],
    scopeGate: 'enforced',
  })
  report.packets[0].packetId = 'pkt-stale'

  assert.equal(scopeAwareVerdict('fail', results, [], report), 'fail')
  assert.deepEqual(repairScopedGraderResults(results, report), results)
})

test('informational current blockers remain visible in the consolidated repair brief', () => {
  const results = [{
    graderId: 'code',
    graderType: 'code-review',
    graderName: 'Code',
    verdict: 'pass' as const,
    summary: '',
    model: 'm',
    durationMs: 0,
    costEstimate: 0,
    findings: [{
      id: 'INFO-BLOCKER',
      severity: 'info' as const,
      category: 'bug',
      file: 'src/current.ts',
      description: 'Candidate-scoped informational blocker.',
      scopeRelationship: 'introduced' as const,
    }],
  }]
  const report = registerFromGraderResults('0'.repeat(40), results, {
    currentPrPaths: ['src/current.ts'],
    scopeGate: 'enforced',
  })
  const brief = buildConsolidatedRepairBrief(
    repairScopedGraderResults(results, report),
    [],
    { includeInformational: true },
  )
  assert.equal(scopeAwareVerdict('pass', results, [], report), 'fail')
  assert.match(brief, /INFO-BLOCKER.*Candidate-scoped informational blocker/)
})

test('spike packets and ticket bodies contain bounded planning fields', () => {
  const report = registerFindings({
    candidateSha: '0'.repeat(40),
    findings: [{ id: 'S', severity: 'info', category: 'spike', file: 'adjacent.ts', description: 'uncertain risk' }],
  }, { currentPrPaths: ['current.ts'], findingsMode: 'ticket' })
  const packet = report.packets[0]
  assert.ok(packet.investigationQuestion)
  assert.ok(packet.exitCriterion)
  assert.match(report.ticketActions[0].body, /Acceptance criteria:/)
  assert.match(report.ticketActions[0].body, /Dependencies:/)
  assert.match(report.ticketActions[0].body, /Test expectations:/)
  assert.match(report.ticketActions[0].body, /Rollout \/ cleanup:/)
})

test('approved ticket dispatch dedupes before create and persists created identity', async () => {
  const report = registerFindings({
    candidateSha: '0'.repeat(40),
    findings: [{
      id: 'F',
      severity: 'minor',
      category: 'bug',
      file: 'adjacent.ts',
      description: 'root cause',
      scopeRelationship: 'pre-existing',
      releaseImpact: 'not-release-blocking',
      evidenceConfidence: 'confirmed',
    }],
  }, {
    currentPrPaths: ['current.ts'],
    findingsMode: 'ticket',
    ticketDispatchEnabled: true,
    ticketTeamId: 'team',
  })
  let creates = 0
  const issue = {
    id: 'uuid', identifier: 'AWC-999', title: 't', description: 'd',
    state: { name: 'Todo', type: 'unstarted' }, team: { key: 'AWC', id: 'team' },
    branchName: '', url: 'https://linear.app/issue/AWC-999',
  } satisfies LinearTicket
  await dispatchFindingTickets(report, 'team', {
    findByFingerprint: async (teamId) => {
      assert.equal(teamId, 'team')
      return null
    },
    createTodo: async () => { creates += 1; return issue },
  })
  assert.equal(creates, 1)
  assert.equal(report.ticketActions[0].dispatched, true)
  assert.equal(report.ticketActions[0].reason, 'created')
  assert.equal(report.ticketActions[0].issueIdentifier, 'AWC-999')

  const duplicate = registerFindings({
    candidateSha: '0'.repeat(40),
    findings: [{
      id: 'OTHER',
      severity: 'minor',
      category: 'bug',
      file: 'adjacent.ts',
      description: 'root cause',
      scopeRelationship: 'pre-existing',
      releaseImpact: 'not-release-blocking',
      evidenceConfidence: 'confirmed',
    }],
  }, {
    currentPrPaths: ['current.ts'],
    findingsMode: 'ticket',
    ticketDispatchEnabled: true,
    ticketTeamId: 'team',
  })
  await dispatchFindingTickets(duplicate, 'team', {
    findByFingerprint: async (teamId) => {
      assert.equal(teamId, 'team')
      return issue
    },
    createTodo: async () => { throw new Error('must not create') },
  })
  assert.equal(duplicate.ticketActions[0].reason, 'duplicate')
})

test('durable ticket reservation serializes concurrent sprints by fingerprint', async () => {
  const reservationDirectory = mkdtempSync(join(tmpdir(), 'mah-249-reservations-'))
  const first = ticketReadyReport()
  const second = ticketReadyReport('OTHER-ID')
  let creates = 0
  const issue = fakeLinearTicket()
  const client = {
    findByFingerprint: async () => null,
    createTodo: async () => {
      creates += 1
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 20))
      return issue
    },
  }

  await Promise.all([
    dispatchFindingTickets(first, 'team', client, { reservationDirectory }),
    dispatchFindingTickets(second, 'team', client, { reservationDirectory }),
  ])

  assert.equal(creates, 1)
  assert.deepEqual(
    [first.ticketActions[0].reason, second.ticketActions[0].reason].sort(),
    ['created', 'duplicate'],
  )
})

test('ticket search and durable receipts are isolated by Linear team', async () => {
  const reservationDirectory = mkdtempSync(join(tmpdir(), 'mah-249-team-reservations-'))
  const teamA = ticketReadyReport('TEAM-A', 'team-a')
  const teamB = ticketReadyReport('TEAM-B', 'team-b')
  const searchedTeams: string[] = []
  const createdTeams: string[] = []
  const client = {
    findByFingerprint: async (teamId: string) => {
      searchedTeams.push(teamId)
      return teamId === 'team-b' ? fakeLinearTicket('team-a') : null
    },
    createTodo: async (teamId: string) => {
      createdTeams.push(teamId)
      return fakeLinearTicket(teamId)
    },
  }

  await dispatchFindingTickets(teamA, 'team-a', client, { reservationDirectory })
  await dispatchFindingTickets(teamB, 'team-b', client, { reservationDirectory })

  assert.deepEqual(searchedTeams.sort(), ['team-a', 'team-b'])
  assert.deepEqual(createdTeams.sort(), ['team-a', 'team-b'])
  assert.equal(teamA.ticketActions[0].reason, 'created')
  assert.equal(teamB.ticketActions[0].reason, 'created')
})

test('ticket dispatch cannot be redirected away from the report team', async () => {
  const report = ticketReadyReport('TEAM-BINDING', 'team-a')
  let calls = 0

  await dispatchFindingTickets(report, 'team-b', {
    findByFingerprint: async () => {
      calls += 1
      return null
    },
    createTodo: async () => {
      calls += 1
      return fakeLinearTicket('team-b')
    },
  })

  assert.equal(calls, 0)
  assert.equal(report.ticketActions[0].reason, 'dispatch-failed')
  assert.match(report.ticketActions[0].error ?? '', /mismatched/)
})

test('definite pre-mutation failure clears the reservation and permits a safe retry', async () => {
  const reservationDirectory = mkdtempSync(join(tmpdir(), 'mah-249-retryable-'))
  const first = ticketReadyReport()
  const second = ticketReadyReport('SAFE-RETRY')
  let attempts = 0
  const client = {
    findByFingerprint: async () => null,
    createTodo: async () => {
      attempts += 1
      if (attempts === 1) {
        throw new LinearIssueCreateNotAttemptedError('Todo state lookup failed')
      }
      return fakeLinearTicket()
    },
  }

  await dispatchFindingTickets(first, 'team', client, { reservationDirectory })
  await dispatchFindingTickets(second, 'team', client, { reservationDirectory })

  assert.equal(attempts, 2)
  assert.equal(first.ticketActions[0].reason, 'dispatch-failed')
  assert.equal(second.ticketActions[0].reason, 'created')
})

test('ambiguous Linear failure leaves a pending reservation and never retries creation', async () => {
  const reservationDirectory = mkdtempSync(join(tmpdir(), 'mah-249-pending-'))
  const first = ticketReadyReport()
  const second = ticketReadyReport('RETRY-ID')
  let creates = 0
  const client = {
    findByFingerprint: async () => null,
    createTodo: async () => {
      creates += 1
      throw new Error('connection lost after request')
    },
  }

  await dispatchFindingTickets(first, 'team', client, { reservationDirectory })
  await dispatchFindingTickets(second, 'team', client, { reservationDirectory })

  assert.equal(creates, 1)
  assert.equal(first.ticketActions[0].reason, 'dispatch-failed')
  assert.equal(second.ticketActions[0].reason, 'dispatch-failed')
  assert.match(second.ticketActions[0].error ?? '', /reconcile it with Linear/)
})

test('ticket dispatch failure stays outside scope-review completeness', async () => {
  const results = [{
    graderId: 'code',
    graderType: 'code-review',
    graderName: 'Code',
    verdict: 'conditional' as const,
    summary: 'adjacent',
    model: 'm',
    durationMs: 0,
    costEstimate: 0,
    findings: [{
      id: 'F',
      severity: 'major' as const,
      category: 'bug',
      file: 'adjacent.ts',
      description: 'root cause',
      scopeRelationship: 'pre-existing' as const,
      releaseImpact: 'not-release-blocking' as const,
      evidenceConfidence: 'confirmed' as const,
    }],
  }]
  const report = registerFromGraderResults('0'.repeat(40), results, {
    currentPrPaths: ['current.ts'],
    scopeGate: 'enforced',
    findingsMode: 'ticket',
    ticketDispatchEnabled: true,
    ticketTeamId: 'team',
  })
  await dispatchFindingTickets(report, 'team', {
    findByFingerprint: async () => null,
    createTodo: async () => { throw new Error('Linear unavailable') },
  })

  assert.equal(report.reviewComplete, true)
  assert.match(report.errors[0], /Linear unavailable/)
  assert.equal(scopeAwareVerdict('fail', results, [], report), 'pass')
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
  assert.doesNotThrow(() => safeRegisterFindings(
    { candidateSha: 'x', findings: [] },
    { scopeGate: 'permissive' as unknown as RegistrarConfig['scopeGate'] },
  ))
})

test('ticket builder skips current-pr-blockers and false-positives', () => {
  const packets: FindingPacket[] = [
    fakePacket('P1', 'current-pr-blocker'),
    fakePacket('P2', 'follow-up'),
    fakePacket('P3', 'false-positive'),
    fakePacket('P4', 'spike-candidate'),
    fakePacket('P5', 'harness-defect'),
  ]
  const actions = buildTicketActions(packets, { findingsMode: 'ticket', ticketDispatchEnabled: false })
  const originIds = actions.map((a) => a.packetId).sort()
  assert.deepEqual(originIds, ['pkt-P2', 'pkt-P4'])
})

test('scope-aware round replays cumulative multi-commit output through routing and persistence', async () => {
  const repo = initGitFixture()
  const baselineSha = gitSha(repo)
  commitFile(repo, 'src/first.ts', 'first\n', 'candidate first')
  commitFile(repo, 'src/second.ts', 'second\n', 'candidate second')
  const candidateSha = gitSha(repo)
  const reportPath = join(repo, '.mah', 'replay', 'findings.json')
  const failures: import('./types.js').DeliveryFailure[] = []
  let ticketCalls = 0

  const result = await processScopeAwareFindingRound({
    repoPath: repo,
    baselineSha,
    candidateSha,
    graderResults: [{
      graderId: 'code',
      graderType: 'code-review',
      graderName: 'Code',
      verdict: 'fail',
      summary: 'Mixed findings.',
      model: 'fixture',
      durationMs: 0,
      costEstimate: 0,
      executionStatus: 'completed',
      findings: [
        {
          id: 'FIRST',
          severity: 'minor',
          category: 'bug',
          file: 'src/first.ts',
          description: 'Regression in the first candidate commit.',
          scopeRelationship: 'introduced',
          releaseImpact: 'not-release-blocking',
          evidenceConfidence: 'confirmed',
        },
        {
          id: 'ADJACENT',
          severity: 'critical',
          category: 'bug',
          file: 'src/old.ts',
          description: 'Pre-existing adjacent issue.',
          scopeRelationship: 'pre-existing',
          releaseImpact: 'not-release-blocking',
          evidenceConfidence: 'confirmed',
        },
      ],
    }],
    failures,
    originalVerdict: 'fail',
    config: {
      scopeGate: 'enforced',
      findingsMode: 'report',
      ticketDispatchEnabled: false,
    },
    scopeStage: 'replay-scope',
    reportPath,
    ticketClient: {
      findByFingerprint: async () => {
        ticketCalls += 1
        throw new Error('report replay must not query Linear')
      },
      createTodo: async () => {
        ticketCalls += 1
        throw new Error('report replay must not mutate Linear')
      },
    },
  })

  assert.deepEqual(result.currentPrPaths, ['src/first.ts', 'src/second.ts'])
  assert.equal(result.report.currentBlockers[0].originFindingId, 'FIRST')
  assert.equal(result.report.adjacent[0].originFindingId, 'ADJACENT')
  assert.equal(result.verdict, 'fail')
  assert.equal(ticketCalls, 0)
  assert.ok(existsSync(reportPath))
})

test('scope-aware round fails closed for harness defects and skips scope when findings are off', async () => {
  const repo = initGitFixture()
  const baselineSha = gitSha(repo)
  commitFile(repo, 'src/current.ts', 'candidate\n', 'candidate')
  const candidateSha = gitSha(repo)
  const harnessFailures: import('./types.js').DeliveryFailure[] = []
  const graderResults = [{
    graderId: 'ux',
    graderType: 'ux',
    graderName: 'UX',
    verdict: 'fail' as const,
    summary: 'Harness issue.',
    model: 'fixture',
    durationMs: 0,
    costEstimate: 0,
    executionStatus: 'completed' as const,
    findings: [{
      id: 'ENV',
      severity: 'critical' as const,
      category: 'environment',
      description: 'Browser credentials were unavailable.',
      scopeRelationship: 'unknown' as const,
      releaseImpact: 'unknown' as const,
      evidenceConfidence: 'confirmed' as const,
    }],
  }]

  const enforced = await processScopeAwareFindingRound({
    repoPath: repo,
    baselineSha,
    candidateSha,
    graderResults,
    failures: harnessFailures,
    originalVerdict: 'fail',
    config: {
      scopeGate: 'enforced',
      findingsMode: 'report',
      ticketDispatchEnabled: false,
    },
    scopeStage: 'enforced-harness',
  })
  assert.equal(enforced.verdict, 'fail')
  assert.equal(enforced.report.harnessDefects.length, 1)
  assert.equal(harnessFailures[0].stage, 'findings-registrar')

  const offFailures: import('./types.js').DeliveryFailure[] = []
  const off = await processScopeAwareFindingRound({
    repoPath: repo,
    baselineSha: undefined,
    candidateSha,
    graderResults,
    failures: offFailures,
    originalVerdict: 'pass',
    config: {
      scopeGate: 'enforced',
      findingsMode: 'off',
      ticketDispatchEnabled: false,
    },
    scopeStage: 'off-scope',
  })
  assert.equal(off.verdict, 'pass')
  assert.deepEqual(offFailures, [])
})

test('advisory scope discovery errors are reported without changing delivery', async () => {
  const repo = initGitFixture()
  const candidateSha = gitSha(repo)
  const failures: import('./types.js').DeliveryFailure[] = []

  const result = await processScopeAwareFindingRound({
    repoPath: repo,
    baselineSha: undefined,
    candidateSha,
    graderResults: [],
    failures,
    originalVerdict: 'pass',
    config: {
      scopeGate: 'advisory',
      findingsMode: 'report',
      ticketDispatchEnabled: false,
    },
    scopeStage: 'advisory-scope',
  })

  assert.equal(result.verdict, 'pass')
  assert.equal(result.report.reviewComplete, false)
  assert.match(result.report.errors.join('\n'), /Scope review incomplete/)
  assert.deepEqual(failures, [])
})

test('report persistence failure preserves packets and fails closed only when enforced', async () => {
  const repo = initGitFixture()
  const baselineSha = gitSha(repo)
  commitFile(repo, 'src/current.ts', 'candidate\n', 'candidate')
  const candidateSha = gitSha(repo)
  const blockingParent = join(repo, 'not-a-directory')
  writeFileSync(blockingParent, 'file\n')
  const failures: import('./types.js').DeliveryFailure[] = []
  const graderResults = [{
    graderId: 'code',
    graderType: 'code-review',
    graderName: 'Code',
    verdict: 'conditional' as const,
    summary: 'Adjacent only.',
    model: 'fixture',
    durationMs: 0,
    costEstimate: 0,
    executionStatus: 'completed' as const,
    findings: [{
      id: 'ADJ',
      severity: 'major' as const,
      category: 'bug',
      file: 'src/old.ts',
      description: 'Pre-existing adjacent issue.',
      scopeRelationship: 'pre-existing' as const,
      releaseImpact: 'not-release-blocking' as const,
      evidenceConfidence: 'confirmed' as const,
    }],
  }]

  const result = await processScopeAwareFindingRound({
    repoPath: repo,
    baselineSha,
    candidateSha,
    graderResults,
    failures,
    originalVerdict: 'fail',
    config: {
      scopeGate: 'enforced',
      findingsMode: 'report',
      ticketDispatchEnabled: false,
    },
    scopeStage: 'persistence',
    reportPath: join(blockingParent, 'findings.json'),
  })

  assert.equal(result.report.adjacent[0].originFindingId, 'ADJ')
  assert.match(result.report.errors.join('\n'), /persistence failed/i)
  assert.equal(failures[0].stage, 'persistence-report')
  assert.equal(result.verdict, 'fail')

  const advisoryFailures: import('./types.js').DeliveryFailure[] = []
  const advisory = await processScopeAwareFindingRound({
    repoPath: repo,
    baselineSha,
    candidateSha,
    graderResults: [],
    failures: advisoryFailures,
    originalVerdict: 'pass',
    config: {
      scopeGate: 'advisory',
      findingsMode: 'report',
      ticketDispatchEnabled: false,
    },
    scopeStage: 'advisory-persistence',
    reportPath: join(blockingParent, 'advisory-findings.json'),
  })
  assert.equal(advisory.verdict, 'pass')
  assert.deepEqual(advisoryFailures, [])
})

function fakePacket(id: string, classification: FindingPacket['classification']): FindingPacket {
  return {
    packetId: `pkt-${id}`,
    candidateSha: '0'.repeat(40),
    classification,
    severity: 'major',
    scopeProvenance: {
      reason: 'test',
      inRepairScope: classification === 'current-pr-blocker',
      relationship: 'unknown',
      releaseImpact: 'unknown',
      evidenceConfidence: 'confirmed',
    },
    sanitizedEvidence: 'evidence',
    risk: 'risk',
    reproduction: 'repro',
    proposedDisposition: 'disposition',
    acceptanceCriteria: ['fixed'],
    dependencies: ['none'],
    testExpectations: ['regression'],
    rolloutOrCleanup: 'verify then clean up',
    originFindingId: id,
    createdAt: 'awc249-fake',
  }
}

function ticketReadyReport(
  id = 'F',
  teamId = 'team',
): ReturnType<typeof registerFindings> {
  return registerFindings({
    candidateSha: '0'.repeat(40),
    findings: [{
      id,
      severity: 'minor',
      category: 'bug',
      file: 'adjacent.ts',
      description: 'same durable root cause',
      scopeRelationship: 'pre-existing',
      releaseImpact: 'not-release-blocking',
      evidenceConfidence: 'confirmed',
    }],
  }, {
    currentPrPaths: ['current.ts'],
    findingsMode: 'ticket',
    ticketDispatchEnabled: true,
    ticketTeamId: teamId,
  })
}

function fakeLinearTicket(teamId = 'team'): LinearTicket {
  return {
    id: 'uuid',
    identifier: 'AWC-999',
    title: 't',
    description: 'd',
    state: { name: 'Todo', type: 'unstarted' },
    team: { key: 'AWC', id: teamId },
    branchName: '',
    url: 'https://linear.app/issue/AWC-999',
  }
}

function initGitFixture(): string {
  const repo = mkdtempSync(join(tmpdir(), 'mah-249-round-'))
  execFileSync('git', ['init', '-q'], { cwd: repo })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo })
  commitFile(repo, 'baseline.txt', 'baseline\n', 'baseline')
  return repo
}

function commitFile(repo: string, path: string, contents: string, message: string): void {
  const absolute = join(repo, path)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, contents)
  execFileSync('git', ['add', path], { cwd: repo })
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: repo })
}

function gitSha(repo: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim()
}
