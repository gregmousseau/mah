import type { DeliveryFailure, GraderResult } from '../types.js'
import { registrarBlockers } from './registrar.js'
import type { RegistrarReport } from './types.js'

export function scopeAwareVerdict(
  original: GraderResult['verdict'],
  results: GraderResult[],
  failures: DeliveryFailure[],
  report: RegistrarReport,
): GraderResult['verdict'] {
  if (report.scopeGate !== 'enforced') return original
  if (!isCompleteScopeReview(results, report)) return original
  if (failures.length > 0 || registrarBlockers(report).length > 0) return 'fail'

  // A non-pass with no finding cannot be proven adjacent, so keep it
  // fail-closed rather than allowing scope classification to erase it.
  if (results.some((result) => result.verdict !== 'pass' && result.findings.length === 0)) {
    return 'fail'
  }
  return 'pass'
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
      packet.originFindingId,
    )))
  const unscopedRepairIds = new Set(blockers
    .filter((packet) => !packet.scopeProvenance.sourceGraderId)
    .map((packet) => packet.originFindingId))
  return results.map((result) => {
    if (result.findings.length === 0) return result
    const findings = result.findings.filter((finding) =>
      repairKeys.has(findingKey(result.graderId, finding.id))
      || unscopedRepairIds.has(finding.id))
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
  const findingCount = results.reduce((count, result) => count + result.findings.length, 0)
  return report.packets.length === findingCount
}

function findingKey(graderId: string, findingId: string): string {
  return `${graderId}\0${findingId}`
}
