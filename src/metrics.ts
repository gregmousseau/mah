import { writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { SprintContract, SprintMetrics, PhaseMetric, SeverityCounts, ProjectConfig } from './types.js'

export function createSprintMetrics(
  contract: SprintContract,
  config: ProjectConfig
): SprintMetrics {
  const startTime = contract.createdAt
  const endTime = contract.completedAt ?? new Date().toISOString()
  const totalDurationMs = new Date(endTime).getTime() - new Date(startTime).getTime()

  const phases: PhaseMetric[] = []
  let totalCost = 0

  // All defects found across all iterations
  const defectsFound: SeverityCounts = { p0: 0, p1: 0, p2: 0, p3: 0 }
  const defectsFixed: SeverityCounts = { p0: 0, p1: 0, p2: 0, p3: 0 }

  for (const iter of contract.iterations) {
    // Dev phase
    if (iter.dev) {
      const devCost = iter.dev.costEstimate ?? 0
      totalCost += devCost
      phases.push({
        phase: 'dev',
        round: iter.round,
        durationMs: iter.dev.durationMs,
        model: iter.dev.model,
        costEstimate: devCost,
      })
    }

    // QA phase
    if (iter.qa) {
      const qaCost = iter.qa.costEstimate ?? 0
      totalCost += qaCost
      phases.push({
        phase: 'qa',
        round: iter.round,
        durationMs: iter.qa.durationMs,
        model: iter.qa.model,
        costEstimate: qaCost,
      })
    }

    // Accumulate defects
    for (const defect of iter.defects) {
      defectsFound[defect.severity]++
      if (defect.fixed) {
        defectsFixed[defect.severity]++
      }
    }
  }

  // Defects remaining = found minus fixed
  const defectsRemaining: SeverityCounts = {
    p0: Math.max(0, defectsFound.p0 - defectsFixed.p0),
    p1: Math.max(0, defectsFound.p1 - defectsFixed.p1),
    p2: Math.max(0, defectsFound.p2 - defectsFixed.p2),
    p3: Math.max(0, defectsFound.p3 - defectsFixed.p3),
  }

  // Bottleneck: find the phase with longest total time
  const phaseTimeTotals: Record<string, number> = {}
  for (const p of phases) {
    const key = `${p.phase}-r${p.round}`
    phaseTimeTotals[key] = (phaseTimeTotals[key] ?? 0) + p.durationMs
  }
  const bottleneck = Object.entries(phaseTimeTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown'

  // Map contract status to verdict
  let verdict: SprintMetrics['verdict'] = 'fail'
  if (contract.status === 'passed') verdict = 'pass'
  else if (contract.status === 'escalated') verdict = 'escalated'
  else if (contract.status === 'failed') verdict = 'fail'

  return {
    sprintId: contract.id,
    projectName: config.project.name,
    task: contract.task,
    startTime,
    endTime,
    phases,
    totals: {
      durationMs: totalDurationMs,
      estimatedCost: totalCost,
      iterations: contract.iterations.length,
      humanWaitMs: 0, // Reserved for future human-in-the-loop tracking
    },
    quality: {
      defectsFound,
      defectsFixed,
      defectsRemaining,
    },
    verdict,
    bottleneck,
  }
}

export function saveMetrics(metrics: SprintMetrics, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true })
  const filePath = join(outputDir, `${metrics.sprintId}.json`)
  writeFileSync(filePath, JSON.stringify(metrics, null, 2), 'utf-8')
}

export function loadAggregateMetrics(outputDir: string): SprintMetrics[] {
  const dir = resolve(outputDir)
  if (!existsSync(dir)) return []

  const files = readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()

  const results: SprintMetrics[] = []
  for (const file of files) {
    try {
      const content = readFileSync(join(dir, file), 'utf-8')
      results.push(JSON.parse(content) as SprintMetrics)
    } catch {
      // Skip malformed files
    }
  }

  return results.sort((a, b) => a.startTime.localeCompare(b.startTime))
}
