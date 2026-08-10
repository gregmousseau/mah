import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import type {
  DeliveryFailure,
  DeliveryIdentity,
  DeliveryEvaluationProvenance,
  ExecutionPreflight,
  Grader,
  GraderFinding,
  GraderResult,
  ProjectConfig,
  SprintContract,
  VerdictMode,
  AgentResult,
  AgentConfig,
  EvaluationEvidenceRequest,
} from './types.js'

export interface DeliveryVerdict {
  verdict: GraderResult['verdict']
  failures: DeliveryFailure[]
  harnessDiagnostics?: DeliveryFailure[]
  productResults: GraderResult[]
}

export function evaluationEvidenceRequest(
  contract: Pick<SprintContract, 'id' | 'agentConfig'>,
  candidateSha: string,
  graderId: string,
  evaluatorId: string,
): EvaluationEvidenceRequest {
  return {
    sprintId: contract.id,
    graderId,
    evaluatorId,
    candidateSha,
  }
}

export function directEvaluatorId(agent: AgentConfig): string {
  return `${agent.type}:${agent.model}`
}

export function buildDeliveryEvaluationProvenance(
  contract: Pick<SprintContract, 'id' | 'agentConfig'>,
  config: Pick<ProjectConfig, 'agents'>,
  candidateSha: string,
  results: GraderResult[],
  executions: AgentResult[],
): DeliveryEvaluationProvenance {
  const evaluatorId = contract.agentConfig?.evaluator.agentId
    || config.agents.evaluator.agentId
    || `${config.agents.evaluator.type}:${config.agents.evaluator.model}`
  return {
    sprintId: contract.id,
    evaluatorId,
    candidateSha,
    graders: results.map((result) => executions.find(
      execution => execution.evaluationEvidence?.graderId === result.graderId,
    )?.evaluationEvidence ?? {
      sprintId: '', graderId: result.graderId, evaluatorId: '', candidateSha: '',
      processExit: 'missing', explicitVerdict: null, finalArtifact: 'unavailable',
    }),
  }
}

export function evaluateDeliveryVerdict(
  configuredGraders: Pick<Grader, 'id' | 'name' | 'enabled'>[],
  results: GraderResult[],
  mode: VerdictMode = 'fail-closed',
  provenance?: DeliveryEvaluationProvenance,
): DeliveryVerdict {
  if (mode === 'legacy') {
    return { verdict: aggregateLegacy(results), failures: [], productResults: results }
  }

  const required = configuredGraders.filter((grader) => grader.enabled)
  const failures: DeliveryFailure[] = []
  const harnessDiagnostics: DeliveryFailure[] = []
  if (required.length === 0) {
    failures.push({
      kind: 'harness',
      stage: 'grader-aggregation',
      message: 'No required graders were configured.',
    })
  }

  const byId = new Map(results.map((result) => [result.graderId, result]))
  for (const grader of required) {
    const result = byId.get(grader.id)
    if (!result) {
      failures.push({
        kind: 'harness',
        stage: 'grader-execution',
        graderId: grader.id,
        message: `Required grader ${grader.name} produced no result.`,
      })
      continue
    }
    const execution = provenance?.graders.find((item) => item.graderId === grader.id)
    if (provenance && (!execution || execution.processExit === 'missing')) {
      failures.push({
        kind: 'harness',
        stage: 'grader-provenance',
        graderId: grader.id,
        message: `Required grader ${grader.name} has no recorded execution provenance.`,
      })
      continue
    }
    if (execution && execution.sprintId !== provenance?.sprintId) {
      failures.push({
        kind: 'identity',
        stage: 'grader-provenance',
        graderId: grader.id,
        message: `Required grader ${grader.name} does not belong to recorded outer sprint ${provenance?.sprintId}.`,
      })
    }
    const expectedEvaluatorId = execution?.expectedEvaluatorId ?? provenance?.evaluatorId
    if (execution && execution.evaluatorId !== expectedEvaluatorId) {
      failures.push({
        kind: 'identity',
        stage: 'grader-provenance',
        graderId: grader.id,
        message: `Required grader ${grader.name} evaluator identity does not match the recorded outer evaluator.`,
      })
    }
    if (execution && execution.candidateSha !== provenance?.candidateSha) {
      failures.push({
        kind: 'identity',
        stage: 'grader-provenance',
        graderId: grader.id,
        message: `Required grader ${grader.name} evaluated ${execution.candidateSha}, not exact candidate ${provenance?.candidateSha}.`,
      })
    }
    if (execution && execution.processExit !== 'completed') {
      failures.push({
        kind: 'harness',
        stage: 'grader-execution',
        graderId: grader.id,
        message: `Required grader ${grader.name} ended with ${execution.processExit}.`,
      })
    }
    if (execution && execution.explicitVerdict !== result.verdict) {
      failures.push({
        kind: 'harness',
        stage: 'grader-provenance',
        graderId: grader.id,
        message: `Required grader ${grader.name} result does not match its explicit recorded verdict.`,
      })
    }
    if (execution?.finalArtifact === 'unavailable') {
      harnessDiagnostics.push({
        kind: 'harness',
        stage: 'grader-final-artifact',
        graderId: grader.id,
        message: `Required grader ${grader.name} final prose artifact is unavailable; structured execution evidence was used.`,
      })
    }
    if ((result.executionStatus ?? 'completed') !== 'completed') {
      failures.push({
        kind: 'harness',
        stage: 'grader-execution',
        graderId: grader.id,
        message: `Required grader ${grader.name} ended with ${result.executionStatus}.`,
      })
    }
  }

  const productResults = results.map((result) => ({
    ...result,
    findings: result.findings.filter((finding) => {
      if (!isEvaluatorSelfReference(finding)) return true
      const execution = provenance?.graders.find((item) => item.graderId === result.graderId)
      const expectedEvaluatorId = execution?.expectedEvaluatorId ?? provenance?.evaluatorId
      const authoritativePass = execution?.sprintId === provenance?.sprintId
        && execution?.evaluatorId === expectedEvaluatorId
        && execution?.candidateSha === provenance?.candidateSha
        && execution?.processExit === 'completed'
        && execution?.explicitVerdict === 'pass'
        && result.verdict === 'pass'
      if (!authoritativePass) return true
      harnessDiagnostics.push({
        kind: 'harness',
        stage: 'evaluator-self-reference',
        graderId: result.graderId,
        message: finding.description,
      })
      return false
    }),
  }))
  if (failures.length > 0) {
    return { verdict: 'fail', failures, harnessDiagnostics, productResults }
  }
  if (productResults.some((result) => result.findings.some(isMaterialFinding))) {
    return { verdict: 'fail', failures: [], harnessDiagnostics, productResults }
  }
  if (productResults.some((result) => result.verdict === 'fail')) {
    return { verdict: 'fail', failures: [], harnessDiagnostics, productResults }
  }
  if (productResults.some((result) => result.verdict === 'conditional')) {
    return { verdict: 'fail', failures: [], harnessDiagnostics, productResults }
  }
  return { verdict: 'pass', failures: [], harnessDiagnostics, productResults }
}

function isEvaluatorSelfReference(finding: GraderFinding): boolean {
  return finding.category.trim().toLowerCase() === 'evaluation-self-reference'
}

function aggregateLegacy(results: GraderResult[]): GraderResult['verdict'] {
  if (results.length === 0) return 'pass'
  if (results.some((result) => result.verdict === 'fail')) return 'fail'
  if (results.some((result) => result.verdict === 'conditional')) return 'conditional'
  return 'pass'
}

export function failedGraderResult(
  grader: Pick<Grader, 'id' | 'type' | 'name' | 'agent'>,
  error: unknown,
  execution?: AgentResult,
): GraderResult {
  const message = error instanceof Error ? error.message : String(error)
  const timedOut = /timed?\s*out|timeout/i.test(message)
  const attempted = execution ?? (
    typeof error === 'object' && error !== null && 'result' in error
      ? (error as { result?: AgentResult }).result
      : undefined
  )
  return {
    graderId: grader.id,
    graderType: grader.type,
    graderName: grader.name,
    verdict: 'fail',
    findings: [],
    summary: message,
    model: attempted?.model ?? grader.agent.model,
    provider: attempted?.provider,
    durationMs: attempted?.timing.durationMs ?? 0,
    costEstimate: attempted?.costEstimate ?? 0,
    executionStatus: timedOut ? 'timed_out' : 'failed',
    processExit: timedOut ? 'timed_out' : attempted ? 'failed' : 'missing',
    finalArtifactAvailable: Boolean(attempted?.output.trim()),
  }
}

export function buildConsolidatedRepairBrief(
  results: GraderResult[],
  failures: DeliveryFailure[] = [],
  options: { includeInformational?: boolean } = {},
): string {
  const lines = ['# Consolidated Repair Brief', '']
  const seen = new Set<string>()
  let materialCount = 0

  for (const result of results) {
    let graderFindingCount = 0
    for (const finding of result.findings) {
      if (!options.includeInformational && !isMaterialFinding(finding)) continue
      const key = [finding.severity, finding.file ?? '', finding.line ?? '', finding.description]
        .join('|')
        .toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      materialCount += 1
      graderFindingCount += 1
      const location = finding.file
        ? ` ${finding.file}${finding.line ? `:${finding.line}` : ''}`
        : ''
      lines.push(
        `- [${result.graderName}] ${finding.id} (${finding.severity})${location} — ${finding.description}`,
      )
      if (finding.suggestion) lines.push(`  Suggestion: ${finding.suggestion}`)
    }
    if (
      result.verdict !== 'pass' &&
      (result.executionStatus ?? 'completed') === 'completed' &&
      graderFindingCount === 0 &&
      result.summary.trim()
    ) {
      materialCount += 1
      lines.push(`- [${result.graderName}] ${result.verdict.toUpperCase()} — ${result.summary.trim()}`)
    }
  }

  for (const failure of failures) {
    materialCount += 1
    lines.push(
      `- [${failure.kind.toUpperCase()}] ${failure.stage}${failure.graderId ? `/${failure.graderId}` : ''} — ${failure.message}`,
    )
  }

  if (materialCount === 0) lines.push('- No material findings were returned.')
  return lines.join('\n')
}

export function buildRepairFeedback(
  rawGraderOutput: string,
  failures: DeliveryFailure[],
): string {
  if (failures.length === 0) return rawGraderOutput
  return `${rawGraderOutput}\n\n${buildConsolidatedRepairBrief([], failures)}`
}

export function restoreRepairFeedback(
  rawGraderOutput: string,
  results: GraderResult[] | undefined,
  failures: DeliveryFailure[] = [],
  options: { includeInformational?: boolean } = {},
): string {
  if (!results) return rawGraderOutput
  return buildConsolidatedRepairBrief(results, failures, options)
}

export function canResumeQAWithPinnedCandidate(
  identity: DeliveryIdentity | undefined,
  identityRound: number | undefined,
  resumeRound: number,
  mode: VerdictMode | undefined,
): boolean {
  return mode === 'legacy' || (identity !== undefined && identityRound === resumeRound)
}

export function hasCompleteRequiredGraderResults(
  configuredGraders: Pick<Grader, 'id' | 'enabled'>[],
  results: GraderResult[] | undefined,
  mode: VerdictMode | undefined,
): boolean {
  if (mode === 'legacy') return true
  const requiredIds = configuredGraders.filter((grader) => grader.enabled).map((grader) => grader.id)
  if (requiredIds.length === 0 || !results) return false
  const resultIds = new Set(results.map((result) => result.graderId))
  return requiredIds.every((id) => resultIds.has(id))
}

function isMaterialFinding(finding: GraderFinding): boolean {
  return finding.findingKind !== 'observation'
}

export function materialGraderFindings(results: GraderResult[]): GraderFinding[] {
  return results.flatMap((result) => result.findings).filter(isMaterialFinding)
}

export function inspectDeliveryPreflight(
  repoPath: string,
  options: { ignoredStatePaths?: string[]; invocationPath?: string } = {},
): {
  identity: DeliveryIdentity
  envFile: string | null
  repoRoot: string
} {
  const requestedRepo = resolve(repoPath.startsWith('~/') ? joinHome(repoPath) : repoPath)
  const invocationPath = resolve(options.invocationPath ?? process.cwd())
  let repo: string
  try {
    repo = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: requestedRepo,
      encoding: 'utf8',
    }).trim()
  } catch {
    throw new Error(`Preflight: ${requestedRepo} is not inside a Git worktree.`)
  }

  const candidateSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim()
  const dirtyEntries = execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: repo, encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean)
    .filter((line) => !isIgnoredHarnessPath(
      line.slice(3),
      repo,
      requestedRepo,
      invocationPath,
      options.ignoredStatePaths,
    ))
  if (dirtyEntries.length > 0) {
    throw new Error(
      `Preflight: candidate worktree is not clean (${dirtyEntries.slice(0, 3).join(', ')}).`,
    )
  }
  const dependencyFingerprint = fingerprintDependencyLock(repo)
  const envCandidates = [
    resolve(requestedRepo, '.env.mah.local'),
    resolve(repo, '.env.mah.local'),
    resolve(invocationPath, '.env.mah.local'),
  ]
  const envFile = envCandidates.find((candidate) => existsSync(candidate)) ?? null
  return { identity: { candidateSha, dependencyFingerprint }, envFile, repoRoot: repo }
}

export function inspectExecutionPreflight(
  repoPath: string,
  generator: Pick<AgentConfig, 'type' | 'model'>,
  options: { ignoredStatePaths?: string[]; invocationPath?: string } = {},
): ExecutionPreflight {
  if (!generator.type?.trim()) {
    throw new Error('Preflight: generator provider is not configured.')
  }
  if (!generator.model?.trim()) {
    throw new Error('Preflight: generator model is not configured.')
  }
  const target = inspectDeliveryPreflight(repoPath, options)
  return {
    repoRoot: target.repoRoot,
    candidateSha: target.identity.candidateSha,
    dependencyFingerprint: target.identity.dependencyFingerprint,
    generatorProvider: generator.type,
    generatorModel: generator.model,
    checkedAt: new Date().toISOString(),
  }
}

export function assertDeliveryIdentity(
  repoPath: string,
  expected: DeliveryIdentity,
  options: { ignoredStatePaths?: string[]; invocationPath?: string } = {},
  stage = 'pre-agent-execution',
): void {
  const failure = verifyDeliveryIdentity(repoPath, expected, options, stage)
  if (failure) {
    throw new Error(`Candidate identity preflight failed: ${failure.message}`)
  }
}

export function changedPathsForCandidate(
  repoPath: string,
  baselineSha: string,
  candidateSha: string,
): string[] {
  const requestedRepo = resolve(repoPath.startsWith('~/') ? joinHome(repoPath) : repoPath)
  try {
    const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: requestedRepo,
      encoding: 'utf8',
    }).trim()
    execFileSync('git', ['rev-parse', '--verify', `${baselineSha}^{commit}`], {
      cwd: requestedRepo,
      stdio: 'ignore',
    })
    execFileSync('git', ['rev-parse', '--verify', `${candidateSha}^{commit}`], {
      cwd: requestedRepo,
      stdio: 'ignore',
    })
    execFileSync('git', ['merge-base', '--is-ancestor', baselineSha, candidateSha], {
      cwd: requestedRepo,
      stdio: 'ignore',
    })
    const output = execFileSync(
      'git',
      ['diff', '--name-only', '--find-renames', baselineSha, candidateSha, '--'],
      { cwd: requestedRepo, encoding: 'utf8' },
    )
    const rootPaths = output.split('\n').map((path) => path.trim()).filter(Boolean)
    const packagePrefix = relative(repoRoot, requestedRepo)
      .replaceAll('\\', '/')
      .replace(/\/+$/, '')
    const packageAliases = !packagePrefix
      || packagePrefix === '.'
      || packagePrefix.startsWith('../')
      ? []
      : rootPaths
        .filter((path) => path.startsWith(`${packagePrefix}/`))
        .map((path) => path.slice(packagePrefix.length + 1))
    const paths = [...new Set([...rootPaths, ...packageAliases])]
    if (paths.length === 0) throw new Error('cumulative candidate diff contains no changed paths')
    return paths
  } catch (error) {
    throw new Error(
      `Scope evidence unavailable for baseline ${baselineSha} and candidate ${candidateSha}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

function isIgnoredHarnessPath(
  path: string,
  repo: string,
  requestedRepo: string,
  invocationPath: string,
  configuredPaths: string[] = [],
): boolean {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '')
  const runtimePaths = [
    '.mah/events',
    '.mah/metrics',
    '.mah/queue',
    '.mah/registrar',
    '.mah/sprints',
    '.mah/heartbeat.json',
    '.mah/notifications/latest.json',
    '.tmp/node-compile-cache',
  ]
  const ignored = [repo, requestedRepo, invocationPath]
    .flatMap((base) => ['.env.mah.local', ...runtimePaths].map((candidate) => resolve(base, candidate)))
    .concat(configuredPaths.map((candidate) => resolve(requestedRepo, candidate)))
    .map((candidate) => relative(repo, candidate).replaceAll('\\', '/').replace(/\/+$/, ''))
    .filter((candidate) => candidate && !candidate.startsWith('../') && !candidate.startsWith('/'))
  return ignored.some((candidate) => normalized === candidate || normalized.startsWith(`${candidate}/`))
}

function joinHome(path: string): string {
  return resolve(homedir(), path.slice(2))
}

function fingerprintDependencyLock(repo: string): string | null {
  for (const name of ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb']) {
    const path = resolve(repo, name)
    if (!existsSync(path)) continue
    return `${name}:sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`
  }
  return null
}

export function identityMismatch(
  expected: DeliveryIdentity,
  actual: DeliveryIdentity,
): DeliveryFailure | null {
  if (
    expected.candidateSha === actual.candidateSha &&
    expected.dependencyFingerprint === actual.dependencyFingerprint
  ) return null
  return {
    kind: 'identity',
    stage: 'delivery-verdict',
    message:
      `Candidate identity changed during review: expected ${expected.candidateSha}` +
      ` (${expected.dependencyFingerprint ?? 'no-lockfile'}), got ${actual.candidateSha}` +
      ` (${actual.dependencyFingerprint ?? 'no-lockfile'}).`,
  }
}

export function classifyDeliveryError(error: unknown, stage: string): DeliveryFailure {
  const message = error instanceof Error ? error.message : String(error)
  return {
    kind: /^preflight:/i.test(message)
      ? 'preflight'
      : /^candidate identity/i.test(message)
        ? 'identity'
        : 'harness',
    stage,
    message,
  }
}

export function verifyDeliveryIdentity(
  repoPath: string,
  expected: DeliveryIdentity,
  options: { ignoredStatePaths?: string[]; invocationPath?: string } = {},
  stage = 'delivery-verdict',
): DeliveryFailure | null {
  try {
    const actual = inspectDeliveryPreflight(repoPath, options).identity
    const mismatch = identityMismatch(expected, actual)
    return mismatch ? { ...mismatch, stage } : null
  } catch (error) {
    return classifyDeliveryError(error, stage)
  }
}
