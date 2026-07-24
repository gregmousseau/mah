// AWC-249: Scope-aware findings registrar.
//
// Consumes grader findings and produces a report of classified,
// sanitized packets plus deduped ticket actions. Safety invariants:
//
//   I1. Registrar failure never hides a genuine current-PR blocker.
//       Any exception is caught, logged into `errors`, and the caller
//       still sees classification of the surviving inputs.
//   I2. `findingsMode: off` short-circuits with an empty report.
//   I3. `scopeGate: advisory` never mutates verdicts — the caller
//       decides how to react to `currentBlockers`.
//   I4. `ticketDispatchEnabled` gates Linear I/O. This module never
//       makes network calls. Dispatch wiring lives out-of-band and is
//       off during sprint, tests, replay, and canary.
//   I5. Classification is deterministic: same inputs → same packet ids.

import { createHash, randomUUID } from 'node:crypto'
import {
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'
import type { GraderFinding, GraderResult } from '../types.js'
import { classifyFinding } from './classify.js'
import {
  sanitizeEvidence,
  sanitizeForPersistence,
  sanitizeIdentifier,
  sanitizeShortField,
} from './redact.js'
import { buildTicketActions } from './ticket.js'
import type {
  FindingPacket,
  FindingsMode,
  RegistrarConfig,
  RegistrarInput,
  RegistrarReport,
  ScopeGateMode,
  TicketAction,
} from './types.js'

export const DEFAULT_REGISTRAR_CONFIG: RegistrarConfig = {
  scopeGate: 'advisory',
  findingsMode: 'report',
  ticketDispatchEnabled: false,
}

function emptyReport(
  candidateSha: string,
  generatedAt: string,
  config: Pick<
    RegistrarConfig,
    'scopeGate' | 'findingsMode' | 'ticketDispatchEnabled' | 'ticketTeamId'
  >,
): RegistrarReport {
  return {
    scopeGate: config.scopeGate,
    findingsMode: config.findingsMode,
    ticketDispatchEnabled: config.ticketDispatchEnabled,
    ...(config.ticketTeamId
      ? { ticketTeamId: sanitizeIdentifier(config.ticketTeamId) }
      : {}),
    reviewComplete: false,
    packets: [],
    currentBlockers: [],
    adjacent: [],
    harnessDefects: [],
    suppressed: [],
    ticketActions: [],
    errors: [],
    candidateSha: sanitizeIdentifier(candidateSha),
    generatedAt,
  }
}

export function registerFindings(
  input: RegistrarInput,
  configPartial?: Partial<RegistrarConfig>,
): RegistrarReport {
  const config = mergeConfig(configPartial)
  const now = reportTimestamp()

  if (config.findingsMode === 'off') {
    return emptyReport(input.candidateSha, now, { ...config, findingsMode: 'off' })
  }

  const packets: FindingPacket[] = []
  const errors: string[] = []

  const findingInputs = input.findingInputs
    ?? (input.findings ?? []).map((finding) => ({ finding, graderId: input.graderId }))
  for (const { finding, graderId } of findingInputs) {
    try {
      const packet = buildPacket(finding, input, config, now, graderId)
      packets.push(packet)
      if (!hasSufficientScopeMetadata(finding, packet)) {
        errors.push(sanitizeEvidence(
          `Scope metadata incomplete for finding ${safeFindingId(finding)}: `
          + 'an adjacent finding requires explicit scopeRelationship=pre-existing '
          + 'and releaseImpact=not-release-blocking.',
        ))
      }
    } catch (err) {
      // I1: never let a per-finding failure hide the rest of the batch.
      // The finding still surfaces as a synthetic packet flagged as a
      // harness defect so a caller in enforced mode still sees it.
      errors.push(
        sanitizeEvidence(
          `Registrar failed to classify finding ${safeFindingId(finding)}: ${errorMessage(err)}`,
        ),
      )
      packets.push(buildFallbackPacket(finding, input, now, graderId))
    }
  }

  const currentBlockers = packets.filter((p) => p.classification === 'current-pr-blocker')
  const adjacent = packets.filter(
    (p) => p.classification === 'follow-up' || p.classification === 'spike-candidate',
  )
  const harnessDefects = packets.filter((p) => p.classification === 'harness-defect')
  const suppressed = packets.filter((p) => p.classification === 'false-positive')

  let ticketActions: TicketAction[] = []
  try {
    ticketActions = buildTicketActions(packets, config)
  } catch (err) {
    errors.push(sanitizeEvidence(`Registrar failed to build ticket actions: ${errorMessage(err)}`))
  }

  return {
    candidateSha: sanitizeIdentifier(input.candidateSha),
    generatedAt: now,
    scopeGate: config.scopeGate,
    findingsMode: config.findingsMode,
    ticketDispatchEnabled: config.ticketDispatchEnabled,
    ...(config.ticketTeamId
      ? { ticketTeamId: sanitizeIdentifier(config.ticketTeamId) }
      : {}),
    reviewComplete: errors.length === 0,
    packets,
    currentBlockers,
    adjacent,
    harnessDefects,
    suppressed,
    ticketActions,
    errors,
  }
}

// Safe wrapper for callers that would otherwise skip the registrar if a
// throw could hide a blocker. Guarantees a report is always returned.
export function safeRegisterFindings(
  input: RegistrarInput,
  configPartial?: Partial<RegistrarConfig>,
): RegistrarReport {
  try {
    return registerFindings(input, configPartial)
  } catch (err) {
    const config = fallbackConfig(configPartial)
    const report = emptyReport(
      safeCandidateSha(input),
      reportTimestamp(),
      config,
    )
    report.errors.push(sanitizeEvidence(`Registrar aborted: ${errorMessage(err)}`))
    return report
  }
}

export function registerFromGraderResults(
  candidateSha: string,
  results: GraderResult[],
  configPartial?: Partial<RegistrarConfig>,
): RegistrarReport {
  const findingInputs = results.flatMap((result) =>
    result.findings.map((finding) => ({ finding, graderId: result.graderId })))
  return safeRegisterFindings({ candidateSha, findingInputs }, configPartial)
}

export function writeRegistrarReport(report: RegistrarReport, outPath: string): void {
  mkdirSync(dirname(outPath), { recursive: true })
  const tempPath = `${outPath}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeFileSync(
      tempPath,
      JSON.stringify(sanitizeForPersistence(report), null, 2),
      { flag: 'wx' },
    )
    renameSync(tempPath, outPath)
  } catch (error) {
    rmSync(tempPath, { force: true })
    throw error
  }
}

// A caller in enforced mode uses this to decide whether the registrar
// itself should block delivery when it discovers a current-PR blocker
// that grader aggregation did not already surface.
export function registrarBlockers(report: RegistrarReport): FindingPacket[] {
  if (report.scopeGate !== 'enforced') return []
  return report.currentBlockers
}

// ─── Internal helpers ─────────────────────────────────────────────────

function mergeConfig(partial?: Partial<RegistrarConfig>): RegistrarConfig {
  const merged: RegistrarConfig = { ...DEFAULT_REGISTRAR_CONFIG, ...(partial ?? {}) }
  validateScopeGate(merged.scopeGate)
  validateFindingsMode(merged.findingsMode)
  if (typeof merged.ticketDispatchEnabled !== 'boolean') {
    throw new Error('registrar.ticketDispatchEnabled must be boolean')
  }
  return merged
}

function hasSufficientScopeMetadata(
  finding: GraderFinding,
  packet: FindingPacket,
): boolean {
  // Findings that already fail closed do not need evidence proving that they
  // can leave the repair loop. Every adjacent route does.
  if (
    packet.classification === 'current-pr-blocker'
    || packet.classification === 'harness-defect'
    || packet.classification === 'false-positive'
  ) {
    return true
  }
  return finding.scopeRelationship === 'pre-existing'
    && finding.releaseImpact === 'not-release-blocking'
}

function fallbackConfig(partial?: Partial<RegistrarConfig>): RegistrarConfig {
  const scopeGate = partial?.scopeGate === 'enforced' ? 'enforced' : 'advisory'
  const findingsMode = partial?.findingsMode === 'off'
    || partial?.findingsMode === 'ticket'
    ? partial.findingsMode
    : 'report'
  return {
    ...DEFAULT_REGISTRAR_CONFIG,
    scopeGate,
    findingsMode,
    ticketDispatchEnabled: partial?.ticketDispatchEnabled === true,
  }
}

function validateScopeGate(mode: ScopeGateMode): void {
  if (mode !== 'advisory' && mode !== 'enforced') {
    throw new Error('registrar.scopeGate must be "advisory" or "enforced"')
  }
}

function validateFindingsMode(mode: FindingsMode): void {
  if (mode !== 'off' && mode !== 'report' && mode !== 'ticket') {
    throw new Error('registrar.findingsMode must be "off", "report", or "ticket"')
  }
}

function buildPacket(
  finding: GraderFinding,
  input: RegistrarInput,
  config: RegistrarConfig,
  now: string,
  graderId?: string,
): FindingPacket {
  const classified = classifyFinding(finding, config, graderId)
  const evidence = sanitizeEvidence(finding.description ?? '')
  const suggestion = finding.suggestion
    ? sanitizeShortField(finding.suggestion)
    : ''

  const candidateSha = sanitizeIdentifier(input.candidateSha)
  const findingId = sanitizeIdentifier(finding.id)
  const category = sanitizeShortField(finding.category || 'risk')
  const reproduction = sanitizeEvidence(reproductionFor(finding))
  const investigationQuestion = finding.investigationQuestion
    ? sanitizeEvidence(finding.investigationQuestion)
    : `Can the reported ${category} be reproduced on candidate ${candidateSha}?`
  const exitCriterion = finding.exitCriterion
    ? sanitizeEvidence(finding.exitCriterion)
    : 'Exit when reproduction is confirmed with implementation-ready scope, or disproved with recorded evidence.'
  const provenance = {
    ...classified.provenance,
    reason: sanitizeEvidence(classified.provenance.reason),
    ...(classified.provenance.matchedPath
      ? { matchedPath: sanitizeIdentifier(classified.provenance.matchedPath) }
      : {}),
    ...(classified.provenance.sourceGraderId
      ? { sourceGraderId: sanitizeIdentifier(classified.provenance.sourceGraderId) }
      : {}),
  }

  const packet: FindingPacket = {
    packetId: findingPacketId(input.candidateSha, finding),
    candidateSha,
    classification: classified.classification,
    severity: finding.severity,
    scopeProvenance: provenance,
    sanitizedEvidence: evidence,
    risk: sanitizeEvidence(riskFor(finding, classified.classification)),
    reproduction,
    proposedDisposition: sanitizeEvidence(
      dispositionFor(classified.classification, suggestion),
    ),
    acceptanceCriteria: acceptanceCriteriaFor(findingId, classified.classification)
      .map(sanitizeEvidence),
    dependencies: ['Confirm ownership and dependencies before moving the future-work issue out of Todo.'],
    testExpectations: [
      sanitizeEvidence(`Add a regression test that fails under the reproduction: ${reproduction}`),
    ],
    rolloutOrCleanup: 'Roll out independently of the current PR; remove temporary guards or diagnostics after verification.',
    ...(classified.classification === 'spike-candidate' ? {
      investigationQuestion,
      exitCriterion,
    } : {}),
    originFindingId: findingId,
    createdAt: now,
  }
  return packet
}

function buildFallbackPacket(
  finding: GraderFinding,
  input: RegistrarInput,
  now: string,
  graderId?: string,
): FindingPacket {
  // I1: even when classification fails, keep the finding in the
  // repair loop by pinning it to harness-defect. That surfaces it in
  // enforced mode without silently dropping a possibly-real blocker.
  return {
    packetId: findingPacketId(input.candidateSha, finding),
    candidateSha: sanitizeIdentifier(input.candidateSha),
    classification: 'harness-defect',
    severity: finding.severity ?? 'major',
    scopeProvenance: {
      reason: 'Registrar classification errored — recording as harness defect.',
      inRepairScope: false,
      relationship: 'unknown',
      releaseImpact: 'unknown',
      evidenceConfidence: 'insufficient',
      ...(graderId ? { sourceGraderId: sanitizeIdentifier(graderId) } : {}),
    },
    sanitizedEvidence: sanitizeEvidence(finding.description ?? ''),
    risk: 'Registrar could not classify — treat as material until reviewed.',
    reproduction: sanitizeEvidence(reproductionFor(finding)),
    proposedDisposition: 'Investigate registrar error and re-run.',
    acceptanceCriteria: ['Registrar completes classification without error and the original finding is dispositioned.'],
    dependencies: ['Registrar or grader infrastructure owner review.'],
    testExpectations: ['Add a regression test for the classification failure.'],
    rolloutOrCleanup: 'Keep delivery fail-closed until classification succeeds.',
    originFindingId: sanitizeIdentifier(safeFindingId(finding)),
    createdAt: now,
  }
}

export function findingPacketId(candidateSha: string, finding: GraderFinding): string {
  const key = [
    candidateSha,
    finding.id ?? '',
    finding.file ?? '',
    finding.line ?? '',
    finding.severity ?? '',
    finding.description ?? '',
  ].join('|')
  return `pkt-${createHash('sha256').update(key).digest('hex').slice(0, 16)}`
}

function riskFor(
  finding: GraderFinding,
  classification: FindingPacket['classification'],
): string {
  if (classification === 'current-pr-blocker') {
    return `Blocks current PR under scope/release policy (${finding.severity} urgency).`
  }
  if (classification === 'harness-defect') {
    return 'Harness/infra defect — may hide product signal if left unaddressed.'
  }
  if (classification === 'false-positive') {
    return 'Marked as false-positive by deterministic allowlist.'
  }
  if (classification === 'spike-candidate') {
    return 'Outside PR scope — candidate for spike / follow-up planning.'
  }
  return 'Adjacent to current PR scope — track as follow-up.'
}

function reproductionFor(finding: GraderFinding): string {
  const parts: string[] = []
  if (finding.file) {
    parts.push(finding.line ? `See ${finding.file}:${finding.line}.` : `See ${finding.file}.`)
  }
  parts.push('Re-run the responsible grader on the pinned candidate SHA.')
  return parts.join(' ')
}

function dispositionFor(
  classification: FindingPacket['classification'],
  suggestion: string,
): string {
  const base = classification === 'current-pr-blocker'
    ? 'Return to dev repair loop.'
    : classification === 'harness-defect'
      ? 'Route to the harness/infra owner; do not create a product ticket.'
      : classification === 'spike-candidate'
        ? 'Queue as spike candidate; do not sprint automatically.'
        : classification === 'false-positive'
          ? 'Suppress from repair loop.'
          : 'Track as follow-up ticket in Todo; leave current PR loop.'
  return suggestion ? `${base} Suggestion: ${suggestion}` : base
}

function acceptanceCriteriaFor(
  findingId: string,
  classification: FindingPacket['classification'],
): string[] {
  if (classification === 'spike-candidate') {
    return ['Record evidence answering the bounded investigation question.', 'Choose implementation follow-up or close as disproved.']
  }
  return [
    `The risk described by finding ${findingId} is no longer reproducible.`,
    'Regression coverage passes on the affected component.',
  ]
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function safeCandidateSha(input: RegistrarInput): string {
  try {
    return typeof input?.candidateSha === 'string' ? input.candidateSha : '(unknown)'
  } catch {
    return '(unreadable)'
  }
}

function safeFindingId(finding: GraderFinding): string {
  try {
    return typeof finding?.id === 'string' ? finding.id : 'unknown'
  } catch {
    return 'unreadable'
  }
}

function reportTimestamp(): string {
  return new Date().toISOString()
}
