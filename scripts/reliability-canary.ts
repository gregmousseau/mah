import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Grader, GraderFinding, GraderResult } from '../src/types.js'
import { evaluateDeliveryVerdict } from '../src/reliability.js'
import {
  DEFAULT_REGISTRAR_CONFIG,
  registerFindings,
  registrarBlockers,
} from '../src/registrar/registrar.js'

type Fixture = {
  name: string
  configuredGraders: Pick<Grader, 'id' | 'name' | 'enabled'>[]
  results: GraderResult[]
}

const awc241 = readFixture('awc-241')
const awc194 = readFixture('awc-194')
const allPass: Fixture = {
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
      `${probe.mode} canary failed for ${probe.fixture.name}: expected ${probe.expected}, got ${actual}`,
    )
  }
  console.log(`PASS ${probe.mode} ${probe.fixture.name}: ${actual}`)
}

function readFixture(name: string): Fixture {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'src', '__fixtures__', 'reliability', `${name}.json`),
      'utf8',
    ),
  )
}

// ─── AWC-249: registrar shadow canary ─────────────────────────────────
//
// The registrar canary confirms that in the shadow rollout (advisory +
// report-only, ticket dispatch OFF) the registrar:
//   * classifies a synthetic PR-scoped major finding as a current-PR
//     blocker
//   * never returns registrarBlockers under advisory scopeGate
//   * never marks a ticket action as "ready" while dispatch is off
//   * never opens a network socket (we replace fetch with a bomb)

const registrarFixture = readRegistrarFixture('awc-241-scope')
const registrarShadow = registerFindings(
  {
    candidateSha: registrarFixture.candidateSha,
    findings: registrarFixture.findings as GraderFinding[],
  },
  { currentPrPaths: registrarFixture.currentPrPaths },
)

if (registrarShadow.scopeGate !== DEFAULT_REGISTRAR_CONFIG.scopeGate) {
  throw new Error('registrar canary: expected default advisory scopeGate')
}
if (registrarShadow.findingsMode !== DEFAULT_REGISTRAR_CONFIG.findingsMode) {
  throw new Error('registrar canary: expected default report findingsMode')
}
if (registrarShadow.ticketDispatchEnabled) {
  throw new Error('registrar canary: ticket dispatch must remain OFF in shadow')
}
if (registrarShadow.currentBlockers.length === 0) {
  throw new Error('registrar canary: expected at least one current-PR blocker in fixture')
}
if (registrarBlockers(registrarShadow).length !== 0) {
  throw new Error('registrar canary: advisory mode must not emit registrarBlockers')
}
for (const action of registrarShadow.ticketActions) {
  if (action.reason === 'ready' || action.dispatched) {
    throw new Error('registrar canary: shadow ticket action must not be dispatched or ready')
  }
}
console.log(`PASS registrar-shadow ${registrarFixture.name}: ${registrarShadow.packets.length} packet(s)`)

const originalFetch = globalThis.fetch
globalThis.fetch = (async () => {
  throw new Error('registrar canary: fetch must not be called')
}) as typeof fetch
try {
  registerFindings(
    {
      candidateSha: registrarFixture.candidateSha,
      findings: registrarFixture.findings as GraderFinding[],
    },
    { currentPrPaths: registrarFixture.currentPrPaths, findingsMode: 'ticket' },
  )
  console.log('PASS registrar-no-fetch ticket-mode shadow')
} finally {
  globalThis.fetch = originalFetch
}

type RegistrarFixture = {
  name: string
  candidateSha: string
  currentPrPaths: string[]
  findings: unknown[]
}

function readRegistrarFixture(name: string): RegistrarFixture {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'src', '__fixtures__', 'registrar', `${name}.json`),
      'utf8',
    ),
  )
}
