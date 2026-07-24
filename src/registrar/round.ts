import type { DeliveryFailure, GraderResult } from '../types.js'
import {
  changedPathsForCandidate,
  classifyDeliveryError,
} from '../reliability.js'
import {
  safeRegisterFindings,
  writeRegistrarReport,
} from './registrar.js'
import {
  registrarHarnessFailures,
  scopeAwareVerdict,
} from './routing.js'
import {
  dispatchFindingTickets,
  type FindingTicketClient,
} from './dispatch.js'
import type { RegistrarConfig, RegistrarReport } from './types.js'

export interface FindingRoundInput {
  repoPath: string
  baselineSha: string | undefined
  candidateSha: string
  graderResults: GraderResult[]
  failures: DeliveryFailure[]
  originalVerdict: GraderResult['verdict']
  config: Partial<RegistrarConfig>
  scopeStage: string
  reportPath?: string
  ticketClient?: FindingTicketClient
  reservationDirectory?: string
}

export interface FindingRoundResult {
  verdict: GraderResult['verdict']
  report: RegistrarReport
  currentPrPaths: string[]
}

export async function processScopeAwareFindingRound(
  input: FindingRoundInput,
): Promise<FindingRoundResult> {
  const config: Partial<RegistrarConfig> = {
    ...input.config,
    currentPrPaths: [...(input.config.currentPrPaths ?? [])],
  }
  let scopeReviewError: string | undefined

  if (config.findingsMode !== 'off') {
    try {
      if (!input.baselineSha) {
        throw new Error('Scope evidence unavailable: sprint baseline SHA was not persisted.')
      }
      const cumulativePaths = changedPathsForCandidate(
        input.repoPath,
        input.baselineSha,
        input.candidateSha,
      )
      config.currentPrPaths = [
        ...new Set([...(config.currentPrPaths ?? []), ...cumulativePaths]),
      ]
    } catch (error) {
      const failure = classifyDeliveryError(error, input.scopeStage)
      if (config.scopeGate === 'enforced') {
        input.failures.push(failure)
      }
      scopeReviewError = failure.message
    }
  }

  const report = safeRegisterFindings(
    {
      candidateSha: input.candidateSha,
      findingInputs: input.graderResults.flatMap((result) =>
        result.findings.map((finding) => ({
          finding,
          graderId: result.graderId,
        }))),
    },
    config,
  )

  if (scopeReviewError) {
    report.reviewComplete = false
    report.errors.push(`Scope review incomplete: ${scopeReviewError}`)
  }
  appendUniqueFailures(input.failures, registrarHarnessFailures(report))

  const verdict = scopeAwareVerdict(
    input.failures.length > 0 ? 'fail' : input.originalVerdict,
    input.graderResults,
    input.failures,
    report,
  )
  await dispatchFindingTickets(
    report,
    config.ticketTeamId,
    input.ticketClient,
    { reservationDirectory: input.reservationDirectory },
  )
  if (input.reportPath) writeRegistrarReport(report, input.reportPath)

  return {
    verdict,
    report,
    currentPrPaths: config.currentPrPaths ?? [],
  }
}

function appendUniqueFailures(
  target: DeliveryFailure[],
  additions: DeliveryFailure[],
): void {
  const seen = new Set(target.map(failureKey))
  for (const failure of additions) {
    const key = failureKey(failure)
    if (seen.has(key)) continue
    seen.add(key)
    target.push(failure)
  }
}

function failureKey(failure: DeliveryFailure): string {
  return [
    failure.kind,
    failure.stage,
    failure.graderId ?? '',
    failure.message,
  ].join('\0')
}
