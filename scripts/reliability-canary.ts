import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Grader, GraderResult } from '../src/types.js'
import { evaluateDeliveryVerdict } from '../src/reliability.js'

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
