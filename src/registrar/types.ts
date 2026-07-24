// AWC-249: Scope-aware findings registrar types.
//
// A registrar consumes grader findings and produces structured, sanitized
// packets that record:
//   * classification (current-PR blocker vs adjacent follow-up work)
//   * scope provenance (why this scope was chosen)
//   * disposition suggestion (repair-loop, follow-up ticket, spike, etc.)
//
// The registrar is additive: it must never hide a genuine current-PR
// blocker. All external side-effects (Linear tickets) are gated behind an
// independent switch that is OFF by default for shadow rollout.

import type { GraderFinding } from '../types.js'

export type FindingClassification =
  | 'current-pr-blocker'
  | 'follow-up'
  | 'spike-candidate'
  | 'harness-defect'
  | 'false-positive'

export type ScopeGateMode = 'advisory' | 'enforced'
export type FindingsMode = 'off' | 'report' | 'ticket'

export interface RegistrarConfig {
  scopeGate: ScopeGateMode
  findingsMode: FindingsMode
  // Independent explicit gate for ticket dispatch. Must remain false for
  // this delivery, the shadow rollout, all canaries, tests, and replay.
  ticketDispatchEnabled: boolean
  // Explicit list of finding IDs the registrar should classify as
  // false-positive (deterministic — same input, same classification).
  falsePositiveIds?: string[]
  // File paths (repo-relative) that are part of the current PR scope.
  // Findings outside this set are treated as adjacent, not current-PR.
  currentPrPaths?: string[]
  // Optional read-only bridge used to dedupe against existing tickets.
  // The registrar never calls listExistingIssues during sprint/tests/
  // canary — the caller must resolve issues out-of-band.
  existingTicketFingerprints?: string[]
  // Linear team UUID used only after explicit ticket dispatch approval.
  ticketTeamId?: string
}

export interface ScopeProvenance {
  reason: string
  inRepairScope: boolean
  matchedPath?: string
  sourceGraderId?: string
  relationship: NonNullable<GraderFinding['scopeRelationship']>
  releaseImpact: NonNullable<GraderFinding['releaseImpact']>
  evidenceConfidence: NonNullable<GraderFinding['evidenceConfidence']>
}

export interface FindingPacket {
  packetId: string
  candidateSha: string
  classification: FindingClassification
  severity: GraderFinding['severity']
  scopeProvenance: ScopeProvenance
  sanitizedEvidence: string
  risk: string
  reproduction: string
  proposedDisposition: string
  acceptanceCriteria: string[]
  dependencies: string[]
  testExpectations: string[]
  rolloutOrCleanup: string
  investigationQuestion?: string
  exitCriterion?: string
  originFindingId: string
  createdAt: string
}

export interface TicketAction {
  fingerprint: string
  packetId: string
  title: string
  body: string
  // Deduped ticket actions are structural only — the registrar builds
  // them but MUST NOT dispatch to Linear during shadow rollout.
  dispatched: boolean
  reason: 'ticket-mode-disabled' | 'duplicate' | 'shadow-only' | 'ready' | 'created' | 'dispatch-failed'
  // Approved dispatch always creates future work in Todo.
  targetState: 'Todo'
  issueId?: string
  issueIdentifier?: string
  issueUrl?: string
  error?: string
}

export interface RegistrarFindingInput {
  finding: GraderFinding
  graderId: string
}

export interface RegistrarInput {
  candidateSha: string
  findings?: GraderFinding[]
  graderId?: string
  findingInputs?: RegistrarFindingInput[]
}

export interface RegistrarReport {
  candidateSha: string
  generatedAt: string
  scopeGate: ScopeGateMode
  findingsMode: FindingsMode
  ticketDispatchEnabled: boolean
  // True only when every finding was reviewed successfully. Dispatch
  // failures do not change this bit, so they cannot put adjacent product
  // findings back into the active repair loop.
  reviewComplete: boolean
  packets: FindingPacket[]
  currentBlockers: FindingPacket[]
  adjacent: FindingPacket[]
  harnessDefects: FindingPacket[]
  suppressed: FindingPacket[]
  ticketActions: TicketAction[]
  errors: string[]
}
