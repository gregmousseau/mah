// AWC-249: Deduped ticket action builder.
//
// The registrar can produce ticket actions in "ticket" findings mode.
// Actions remain structural in shadow mode. An explicitly gated dispatcher
// performs the mutation after querying Linear for the same fingerprint.
//
// A dispatched ticket must:
//   * be deduped against existingTicketFingerprints in its target team
//   * land in "Todo" (never "In Progress" and never start a sprint)
//
// Dispatch is performed separately so report/shadow registration remains
// side-effect free.

import { createHash } from 'node:crypto'
import type { FindingPacket, TicketAction, RegistrarConfig } from './types.js'

export function buildTicketActions(
  packets: FindingPacket[],
  config: Pick<
    RegistrarConfig,
    'findingsMode'
    | 'ticketDispatchEnabled'
    | 'existingTicketFingerprints'
    | 'ticketTeamId'
  >,
): TicketAction[] {
  const existing = new Set(
    (config.existingTicketFingerprints ?? [])
      .filter((item) => item.teamId === config.ticketTeamId)
      .map((item) => item.fingerprint),
  )
  const seenThisRun = new Set<string>()
  const actions: TicketAction[] = []

  for (const packet of packets) {
    if (packet.classification === 'current-pr-blocker') continue
    if (packet.classification === 'false-positive') continue
    if (packet.classification === 'harness-defect') continue

    const fingerprint = ticketFingerprint(packet)
    const title = titleFor(packet)
    const body = bodyFor(packet)

    const reason: TicketAction['reason'] = pickReason(
      fingerprint,
      existing,
      seenThisRun,
      config,
    )

    actions.push({
      fingerprint,
      packetId: packet.packetId,
      title,
      body,
      dispatched: false,
      reason,
      targetState: 'Todo',
    })

    seenThisRun.add(fingerprint)
  }

  return actions
}

function pickReason(
  fingerprint: string,
  existing: Set<string>,
  seenThisRun: Set<string>,
  config: Pick<RegistrarConfig, 'findingsMode' | 'ticketDispatchEnabled'>,
): TicketAction['reason'] {
  if (config.findingsMode !== 'ticket') return 'ticket-mode-disabled'
  if (existing.has(fingerprint) || seenThisRun.has(fingerprint)) return 'duplicate'
  if (!config.ticketDispatchEnabled) return 'shadow-only'
  return 'ready'
}

export function ticketFingerprint(packet: FindingPacket): string {
  const key = [
    normalize(packet.scopeProvenance.matchedPath ?? ''),
    normalize(packet.sanitizedEvidence),
  ].join('|')
  return `awc249-${createHash('sha256').update(key).digest('hex').slice(0, 16)}`
}

function titleFor(packet: FindingPacket): string {
  const scope = packet.scopeProvenance.matchedPath
    ? ` (${packet.scopeProvenance.matchedPath})`
    : ''
  const summary = packet.sanitizedEvidence.split(/[.\n]/, 1)[0].slice(0, 80)
  return `[${packet.classification}] ${summary || packet.originFindingId}${scope}`
}

function bodyFor(packet: FindingPacket): string {
  return [
    `Candidate SHA: ${packet.candidateSha}`,
    `Severity: ${packet.severity}`,
    `Classification: ${packet.classification}`,
    `Scope: ${packet.scopeProvenance.reason}`,
    '',
    'Sanitized evidence:',
    packet.sanitizedEvidence,
    '',
    `Risk: ${packet.risk}`,
    `Reproduction: ${packet.reproduction}`,
    `Proposed disposition: ${packet.proposedDisposition}`,
    '',
    'Acceptance criteria:',
    ...packet.acceptanceCriteria.map((item) => `- ${item}`),
    '',
    'Dependencies:',
    ...packet.dependencies.map((item) => `- ${item}`),
    '',
    'Test expectations:',
    ...packet.testExpectations.map((item) => `- ${item}`),
    '',
    `Rollout / cleanup: ${packet.rolloutOrCleanup}`,
    ...(packet.investigationQuestion
      ? ['', `Investigation question: ${packet.investigationQuestion}`, `Exit criterion: ${packet.exitCriterion}`]
      : []),
    '',
    `Registrar fingerprint: ${ticketFingerprint(packet)}`,
    '',
    'Auto-registered by AWC-249 registrar. Leave in Todo — do not auto-sprint.',
  ].join('\n')
}

function normalize(value: string): string {
  return value.toLowerCase().replaceAll('\\', '/').replace(/\s+/g, ' ').trim()
}
