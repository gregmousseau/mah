import type { DeliveryFailure, GraderResult } from '../types.js'
import { findingPacketId, registrarBlockers } from './registrar.js'
import type { RegistrarReport } from './types.js'

export function scopeAwareVerdict(
  original: GraderResult['verdict'],
  results: GraderResult[],
  failures: DeliveryFailure[],
  report: RegistrarReport,
): GraderResult['verdict'] {
  if (report.scopeGate !== 'enforced') return original
  if (report.findingsMode === 'off') return original
  if (!isCompleteScopeReview(results, report)) return 'fail'
  if (
    failures.length > 0
    || registrarBlockers(report).length > 0
    || report.harnessDefects.length > 0
  ) return 'fail'

  // A non-pass with no finding cannot be proven adjacent, so keep it
  // fail-closed rather than allowing scope classification to erase it.
  if (results.some((result) => result.verdict !== 'pass' && result.findings.length === 0)) {
    return 'fail'
  }
  return 'pass'
}

export function registrarHarnessFailures(report: RegistrarReport): DeliveryFailure[] {
  if (report.scopeGate !== 'enforced') return []
  return report.harnessDefects.map((packet) => ({
    kind: 'harness',
    stage: 'findings-registrar',
    graderId: packet.scopeProvenance.sourceGraderId,
    message:
      `${packet.originFindingId}: ${packet.sanitizedEvidence || packet.scopeProvenance.reason}`,
  }))
}

export function repairScopedGraderResults(
  results: GraderResult[],
  report: RegistrarReport | undefined,
): GraderResult[] {
  if (!report || report.scopeGate !== 'enforced') return results
  if (!isCompleteScopeReview(results, report)) return results

  const blockers = registrarBlockers(report)
  const repairKeys = new Set(blockers
    .filter((packet) => packet.scopeProvenance.sourceGraderId)
    .map((packet) => findingKey(
      packet.scopeProvenance.sourceGraderId!,
      packet.packetId,
    )))
  const unscopedRepairIds = new Set(blockers
    .filter((packet) => !packet.scopeProvenance.sourceGraderId)
    .map((packet) => packet.packetId))
  return results.map((result) => {
    if (result.findings.length === 0) return result
    const findings = result.findings.filter((finding) =>
      repairKeys.has(findingKey(
        result.graderId,
        findingPacketId(report.candidateSha, finding),
      ))
      || unscopedRepairIds.has(findingPacketId(report.candidateSha, finding)))
    return {
      ...result,
      findings,
      // Prevent an adjacent-only grader verdict/summary from extending
      // the active repair loop. Unexplained non-pass results are retained.
      verdict: findings.length > 0 ? result.verdict : 'pass',
    }
  })
}

function isCompleteScopeReview(
  results: GraderResult[],
  report: RegistrarReport,
): boolean {
  if (report.findingsMode === 'off' || !report.reviewComplete) return false
  if (report.packets.some((packet) => packet.candidateSha !== report.candidateSha)) return false

  const expected = new Map<string, number>()
  for (const result of results) {
    for (const finding of result.findings) {
      incrementCount(
        expected,
        findingKey(result.graderId, findingPacketId(report.candidateSha, finding)),
      )
    }
  }
  const actual = new Map<string, number>()
  for (const packet of report.packets) {
    if (!packet.scopeProvenance.sourceGraderId) return false
    incrementCount(
      actual,
      findingKey(packet.scopeProvenance.sourceGraderId, packet.packetId),
    )
  }
  if (expected.size !== actual.size) return false
  return [...expected].every(([key, count]) => actual.get(key) === count)
}

function findingKey(graderId: string, findingId: string): string {
  return `${graderId}\0${findingId}`
}

function incrementCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1)
}
