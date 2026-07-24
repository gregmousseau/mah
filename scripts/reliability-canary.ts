import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type {
  DeliveryFailure,
  Grader,
  GraderFinding,
  GraderResult,
} from '../src/types.js'
import { evaluateDeliveryVerdict } from '../src/reliability.js'
import type { FindingTicketClient } from '../src/registrar/dispatch.js'
import { processScopeAwareFindingRound } from '../src/registrar/round.js'

type ReliabilityFixture = {
  name: string
  configuredGraders: Pick<Grader, 'id' | 'name' | 'enabled'>[]
  results: GraderResult[]
}

type RegistrarFixture = {
  name: string
  candidateSha: string
  currentPrPaths: string[]
  findings: GraderFinding[]
}

interface MaterializedReplay {
  repo: string
  baselineSha: string
  candidateSha: string
  fixture: RegistrarFixture
}

async function main(): Promise<void> {
  runVerdictCanaries()
  await runRegistrarReplayCanaries()
}

function runVerdictCanaries(): void {
  const awc241 = readReliabilityFixture('awc-241')
  const awc194 = readReliabilityFixture('awc-194')
  const allPass: ReliabilityFixture = {
    name: 'all required graders pass',
    configuredGraders: awc241.configuredGraders,
    results: awc241.results.map((result) => ({
      ...result,
      verdict: 'pass',
      findings: [],
      summary: 'Fixture pass.',
      executionStatus: 'completed',
    })),
  }

  const probes = [
    { fixture: awc241, mode: 'fail-closed' as const, expected: 'fail' },
    { fixture: awc194, mode: 'fail-closed' as const, expected: 'fail' },
    { fixture: allPass, mode: 'fail-closed' as const, expected: 'pass' },
    { fixture: awc241, mode: 'legacy' as const, expected: 'conditional' },
  ]

  for (const probe of probes) {
    const actual = evaluateDeliveryVerdict(
      probe.fixture.configuredGraders,
      probe.fixture.results,
      probe.mode,
    ).verdict
    if (actual !== probe.expected) {
      throw new Error(
        `${probe.mode} canary failed for ${probe.fixture.name}: ` +
        `expected ${probe.expected}, got ${actual}`,
      )
    }
    console.log(`PASS ${probe.mode} ${probe.fixture.name}: ${actual}`)
  }
}

async function runRegistrarReplayCanaries(): Promise<void> {
  const canaries = [
    {
      replay: materializeReplay(readRegistrarFixture('awc-241-scope')),
      expectedBlockers: 1,
      findingsMode: 'report' as const,
    },
    {
      replay: materializeReplay(readRegistrarFixture('awc-194-harness')),
      expectedBlockers: 0,
      findingsMode: 'report' as const,
    },
    {
      replay: materializeReplay(readRegistrarFixture('redaction-probe')),
      expectedBlockers: 1,
      findingsMode: 'ticket' as const,
    },
  ]

  for (const { replay, expectedBlockers, findingsMode } of canaries) {
    let linearCalls = 0
    const trappingClient: FindingTicketClient = {
      findByFingerprint: async () => {
        linearCalls += 1
        throw new Error('shadow replay must not query Linear')
      },
      createTodo: async () => {
        linearCalls += 1
        throw new Error('shadow replay must not create a Linear issue')
      },
    }
    const reportPath = join(replay.repo, '.mah', 'replay', 'findings.json')
    const graderResults = replayGraderResults(replay.fixture)
    const failures: DeliveryFailure[] = []
    const result = await processScopeAwareFindingRound({
      repoPath: replay.repo,
      baselineSha: replay.baselineSha,
      candidateSha: replay.candidateSha,
      graderResults,
      failures,
      originalVerdict: 'fail',
      config: {
        scopeGate: 'advisory',
        findingsMode,
        ticketDispatchEnabled: false,
      },
      scopeStage: `canary-${replay.fixture.name}`,
      reportPath,
      ticketClient: trappingClient,
    })

    if (result.report.currentBlockers.length !== expectedBlockers) {
      throw new Error(
        `${replay.fixture.name}: expected ${expectedBlockers} blocker(s), ` +
        `got ${result.report.currentBlockers.length}`,
      )
    }
    if (!result.currentPrPaths.includes(replay.fixture.currentPrPaths[0])) {
      throw new Error(`${replay.fixture.name}: cumulative first-commit path was lost`)
    }
    if (!result.currentPrPaths.includes('canary/second-commit.txt')) {
      throw new Error(`${replay.fixture.name}: cumulative second-commit path was lost`)
    }
    if (!existsSync(reportPath)) {
      throw new Error(`${replay.fixture.name}: registrar report was not persisted`)
    }
    if (linearCalls !== 0) {
      throw new Error(`${replay.fixture.name}: shadow replay crossed the Linear boundary`)
    }
    for (const action of result.report.ticketActions) {
      if (action.reason === 'ready' || action.dispatched) {
        throw new Error(`${replay.fixture.name}: shadow ticket action became mutable`)
      }
    }
    console.log(
      `PASS registrar-replay ${replay.fixture.name}: ` +
      `${result.report.packets.length} packet(s), Linear calls=${linearCalls}`,
    )
  }

  // Enforced replay proves a completed harness finding cannot be converted
  // into a product ticket or an accidental pass.
  const harnessReplay = canaries[1].replay
  const harnessFailures: DeliveryFailure[] = []
  const enforced = await processScopeAwareFindingRound({
    repoPath: harnessReplay.repo,
    baselineSha: harnessReplay.baselineSha,
    candidateSha: harnessReplay.candidateSha,
    graderResults: replayGraderResults(harnessReplay.fixture),
    failures: harnessFailures,
    originalVerdict: 'fail',
    config: {
      scopeGate: 'enforced',
      findingsMode: 'report',
      ticketDispatchEnabled: false,
    },
    scopeStage: 'canary-enforced-harness',
  })
  if (
    enforced.verdict !== 'fail'
    || enforced.report.harnessDefects.length === 0
    || !harnessFailures.some((failure) => failure.stage === 'findings-registrar')
  ) {
    throw new Error('enforced harness replay did not fail closed')
  }
  console.log('PASS registrar-enforced harness replay: fail-closed')
}

function materializeReplay(fixture: RegistrarFixture): MaterializedReplay {
  const repo = mkdtempSync(join(tmpdir(), 'mah-249-canary-'))
  execFileSync('git', ['init', '-q'], { cwd: repo })
  execFileSync('git', ['config', 'user.email', 'canary@example.invalid'], { cwd: repo })
  execFileSync('git', ['config', 'user.name', 'MAH Canary'], { cwd: repo })
  commitFile(repo, 'baseline.txt', 'baseline\n', 'baseline')
  const baselineSha = gitSha(repo)
  commitFile(repo, fixture.currentPrPaths[0], 'first candidate change\n', 'candidate first')
  commitFile(repo, 'canary/second-commit.txt', 'second candidate change\n', 'candidate second')
  return {
    repo,
    baselineSha,
    candidateSha: gitSha(repo),
    fixture,
  }
}

function replayGraderResults(fixture: RegistrarFixture): GraderResult[] {
  return [{
    graderId: `replay-${fixture.candidateSha.slice(-4)}`,
    graderType: 'code-review',
    graderName: fixture.name,
    verdict: 'fail',
    findings: fixture.findings,
    summary: fixture.name,
    model: 'persisted-replay',
    durationMs: 0,
    costEstimate: 0,
    executionStatus: 'completed',
  }]
}

function commitFile(repo: string, path: string, contents: string, message: string): void {
  const absolute = join(repo, path)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, contents)
  execFileSync('git', ['add', path], { cwd: repo })
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: repo })
}

function gitSha(repo: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim()
}

function readReliabilityFixture(name: string): ReliabilityFixture {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'src', '__fixtures__', 'reliability', `${name}.json`),
      'utf8',
    ),
  )
}

function readRegistrarFixture(name: string): RegistrarFixture {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'src', '__fixtures__', 'registrar', `${name}.json`),
      'utf8',
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
