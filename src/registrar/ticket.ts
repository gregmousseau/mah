// AWC-249: Deduped ticket action builder.
//
// The registrar can produce ticket actions in "ticket" findings mode.
// Those actions are structural records only — the registrar MUST NOT
// dispatch them to Linear during this sprint, its tests, replay
// fixtures, or the reliability canary.
//
// A dispatched ticket must:
//   * be deduped against existingTicketFingerprints
//   * land in "Todo" (never "In Progress" and never start a sprint)
//
// The dispatch wiring itself is intentionally omitted here.

import { createHash } from 'node:crypto'
import type { FindingPacket, TicketAction, RegistrarConfig } from './types.js'

export function buildTicketActions(
  packets: FindingPacket[],
  config: Pick<
    RegistrarConfig,
    'findingsMode' | 'ticketDispatchEnabled' | 'existingTicketFingerprints'
  >,
): TicketAction[] {
  const existing = new Set(config.existingTicketFingerprints ?? [])
  const seenThisRun = new Set<string>()
  const actions: TicketAction[] = []

  for (const packet of packets) {
    if (packet.classification === 'current-pr-blocker') continue
    if (packet.classification === 'false-positive') continue

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
    packet.classification,
    packet.severity,
    packet.originFindingId,
    packet.scopeProvenance.matchedPath ?? '',
  ].join('|')
  return `awc249-${createHash('sha256').update(key).digest('hex').slice(0, 16)}`
}

function titleFor(packet: FindingPacket): string {
  const scope = packet.scopeProvenance.matchedPath
    ? ` (${packet.scopeProvenance.matchedPath})`
    : ''
  return `[${packet.classification}] ${packet.originFindingId}${scope}`
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
    'Auto-registered by AWC-249 registrar. Leave in Todo — do not auto-sprint.',
  ].join('\n')
}
