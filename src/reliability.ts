import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import type {
  DeliveryFailure,
  DeliveryIdentity,
  Grader,
  GraderFinding,
  GraderResult,
  VerdictMode,
} from './types.js'

export interface DeliveryVerdict {
  verdict: GraderResult['verdict']
  failures: DeliveryFailure[]
}

export function evaluateDeliveryVerdict(
  configuredGraders: Pick<Grader, 'id' | 'name' | 'enabled'>[],
  results: GraderResult[],
  mode: VerdictMode = 'fail-closed',
): DeliveryVerdict {
  if (mode === 'legacy') {
    return { verdict: aggregateLegacy(results), failures: [] }
  }

  const required = configuredGraders.filter((grader) => grader.enabled)
  const failures: DeliveryFailure[] = []
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
    if ((result.executionStatus ?? 'completed') !== 'completed') {
      failures.push({
        kind: 'harness',
        stage: 'grader-execution',
        graderId: grader.id,
        message: `Required grader ${grader.name} ended with ${result.executionStatus}.`,
      })
    }
  }

  if (failures.length > 0) return { verdict: 'fail', failures }
  if (results.some((result) => result.verdict === 'fail')) {
    return { verdict: 'fail', failures: [] }
  }
  if (results.some((result) => result.verdict === 'conditional')) {
    return { verdict: 'fail', failures: [] }
  }
  return { verdict: 'pass', failures: [] }
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
): GraderResult {
  const message = error instanceof Error ? error.message : String(error)
  const timedOut = /timed?\s*out|timeout/i.test(message)
  return {
    graderId: grader.id,
    graderType: grader.type,
    graderName: grader.name,
    verdict: 'fail',
    findings: [],
    summary: message,
    model: grader.agent.model,
    durationMs: 0,
    costEstimate: 0,
    executionStatus: timedOut ? 'timed_out' : 'failed',
  }
}

export function buildConsolidatedRepairBrief(
  results: GraderResult[],
  failures: DeliveryFailure[] = [],
): string {
  const lines = ['# Consolidated Repair Brief', '']
  const seen = new Set<string>()
  let materialCount = 0

  for (const result of results) {
    let graderFindingCount = 0
    for (const finding of result.findings) {
      if (!isMaterialFinding(finding)) continue
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
): string {
  if (!results) return rawGraderOutput
  return buildConsolidatedRepairBrief(results, failures)
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
  return finding.severity !== 'info'
}

export function materialGraderFindings(results: GraderResult[]): GraderFinding[] {
  return results.flatMap((result) => result.findings).filter(isMaterialFinding)
}

export function inspectDeliveryPreflight(
  repoPath: string,
  options: { ignoredStatePaths?: string[] } = {},
): {
  identity: DeliveryIdentity
  envFile: string | null
} {
  const requestedRepo = resolve(repoPath.startsWith('~/') ? joinHome(repoPath) : repoPath)
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
    resolve(process.cwd(), '.env.mah.local'),
  ]
  const envFile = envCandidates.find((candidate) => existsSync(candidate)) ?? null
  return { identity: { candidateSha, dependencyFingerprint }, envFile }
}

function isIgnoredHarnessPath(
  path: string,
  repo: string,
  requestedRepo: string,
  configuredPaths: string[] = [],
): boolean {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '')
  const runtimePaths = [
    '.mah/events',
    '.mah/metrics',
    '.mah/queue',
    '.mah/sprints',
    '.mah/heartbeat.json',
    '.mah/notifications/latest.json',
  ]
  const ignored = [repo, requestedRepo]
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
  options: { ignoredStatePaths?: string[] } = {},
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
