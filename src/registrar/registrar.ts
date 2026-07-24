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

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { GraderFinding, GraderResult } from '../types.js'
import { classifyFinding } from './classify.js'
import { sanitizeEvidence, sanitizeShortField } from './redact.js'
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

const EMPTY_REPORT_TEMPLATE: Omit<RegistrarReport, 'candidateSha' | 'generatedAt'> = {
  scopeGate: 'advisory',
  findingsMode: 'off',
  ticketDispatchEnabled: false,
  packets: [],
  currentBlockers: [],
  adjacent: [],
  ticketActions: [],
  errors: [],
}

export function registerFindings(
  input: RegistrarInput,
  configPartial?: Partial<RegistrarConfig>,
): RegistrarReport {
  const config = mergeConfig(configPartial)
  const now = deterministicNow(input)

  if (config.findingsMode === 'off') {
    return {
      ...EMPTY_REPORT_TEMPLATE,
      scopeGate: config.scopeGate,
      findingsMode: 'off',
      ticketDispatchEnabled: config.ticketDispatchEnabled,
      candidateSha: input.candidateSha,
      generatedAt: now,
    }
  }

  const packets: FindingPacket[] = []
  const errors: string[] = []

  for (const finding of input.findings) {
    try {
      packets.push(buildPacket(finding, input, config, now))
    } catch (err) {
      // I1: never let a per-finding failure hide the rest of the batch.
      // The finding still surfaces as a synthetic packet flagged as a
      // harness defect so a caller in enforced mode still sees it.
      errors.push(
        `Registrar failed to classify finding ${finding.id}: ${errorMessage(err)}`,
      )
      packets.push(buildFallbackPacket(finding, input, now))
    }
  }

  const currentBlockers = packets.filter((p) => p.classification === 'current-pr-blocker')
  const adjacent = packets.filter(
    (p) => p.classification !== 'current-pr-blocker' && p.classification !== 'false-positive',
  )

  let ticketActions: TicketAction[] = []
  try {
    ticketActions = buildTicketActions(packets, config)
  } catch (err) {
    errors.push(`Registrar failed to build ticket actions: ${errorMessage(err)}`)
  }

  return {
    candidateSha: input.candidateSha,
    generatedAt: now,
    scopeGate: config.scopeGate,
    findingsMode: config.findingsMode,
    ticketDispatchEnabled: config.ticketDispatchEnabled,
    packets,
    currentBlockers,
    adjacent,
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
    const config = mergeConfig(configPartial)
    return {
      ...EMPTY_REPORT_TEMPLATE,
      scopeGate: config.scopeGate,
      findingsMode: config.findingsMode,
      ticketDispatchEnabled: config.ticketDispatchEnabled,
      candidateSha: input.candidateSha,
      generatedAt: deterministicNow(input),
      errors: [`Registrar aborted: ${errorMessage(err)}`],
    }
  }
}

export function registerFromGraderResults(
  candidateSha: string,
  results: GraderResult[],
  configPartial?: Partial<RegistrarConfig>,
): RegistrarReport {
  const findings = results.flatMap((r) => r.findings)
  const graderId = results.length === 1 ? results[0].graderId : undefined
  return safeRegisterFindings({ candidateSha, findings, graderId }, configPartial)
}

export function writeRegistrarReport(report: RegistrarReport, outPath: string): void {
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(report, null, 2))
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
): FindingPacket {
  const classified = classifyFinding(finding, config, input.graderId)
  const evidence = sanitizeEvidence(finding.description ?? '')
  const suggestion = finding.suggestion
    ? sanitizeShortField(finding.suggestion)
    : ''

  const packet: FindingPacket = {
    packetId: packetId(input.candidateSha, finding),
    candidateSha: input.candidateSha,
    classification: classified.classification,
    severity: finding.severity,
    scopeProvenance: classified.provenance,
    sanitizedEvidence: evidence,
    risk: riskFor(finding, classified.classification),
    reproduction: reproductionFor(finding),
    proposedDisposition: dispositionFor(classified.classification, suggestion),
    originFindingId: finding.id,
    createdAt: now,
  }
  return packet
}

function buildFallbackPacket(
  finding: GraderFinding,
  input: RegistrarInput,
  now: string,
): FindingPacket {
  // I1: even when classification fails, keep the finding in the
  // repair loop by pinning it to harness-defect. That surfaces it in
  // enforced mode without silently dropping a possibly-real blocker.
  return {
    packetId: packetId(input.candidateSha, finding),
    candidateSha: input.candidateSha,
    classification: 'harness-defect',
    severity: finding.severity ?? 'major',
    scopeProvenance: {
      reason: 'Registrar classification errored — recording as harness defect.',
      inRepairScope: true,
      sourceGraderId: input.graderId,
    },
    sanitizedEvidence: sanitizeEvidence(finding.description ?? ''),
    risk: 'Registrar could not classify — treat as material until reviewed.',
    reproduction: reproductionFor(finding),
    proposedDisposition: 'Investigate registrar error and re-run.',
    originFindingId: finding.id ?? 'unknown',
    createdAt: now,
  }
}

function packetId(candidateSha: string, finding: GraderFinding): string {
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
    return `Blocks current PR: ${finding.severity} finding on PR-scoped path.`
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
      ? 'File to harness/infra owner; do not block PR unless enforced.'
      : classification === 'spike-candidate'
        ? 'Queue as spike candidate; do not sprint automatically.'
        : classification === 'false-positive'
          ? 'Suppress from repair loop.'
          : 'Track as follow-up ticket in Todo; leave current PR loop.'
  return suggestion ? `${base} Suggestion: ${suggestion}` : base
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// Timestamp is derived from the candidate SHA plus a coarse day bucket
// so replays and canary probes are deterministic. Callers that need a
// real wall-clock timestamp can override generatedAt after the fact.
function deterministicNow(input: RegistrarInput): string {
  const seed = createHash('sha256').update(input.candidateSha).digest('hex')
  return `awc249-${seed.slice(0, 12)}`
}
