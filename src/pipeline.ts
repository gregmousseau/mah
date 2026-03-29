import { writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import chalk from 'chalk'
import { OpenClawAdapter } from './adapters/openclaw.js'
import {
  generateContract,
  generateSprintId,
  contractToDevPrompt,
  contractToQAPrompt,
  contractToDevFixPrompt,
} from './contract.js'
import { parseQAReport } from './parser.js'
import { buildCodeReviewPrompt, parseCodeReviewResult } from './graders/code-review.js'
import { createSprintMetrics, saveMetrics } from './metrics.js'
import { EventLogger } from './events.js'
import type {
  ProjectConfig,
  SprintContract,
  SprintMetrics,
  SprintIteration,
  PhaseResult,
  SprintTranscript,
  TranscriptPhase,
  GraderResult,
} from './types.js'

function writeNotification(contract: SprintContract, metrics: SprintMetrics): void {
  try {
    const notification = {
      type: 'sprint_complete',
      sprintId: contract.id,
      name: contract.name,
      verdict: contract.status,
      iterations: contract.iterations.length,
      cost: metrics.totals.estimatedCost,
      duration: metrics.totals.durationMs,
      timestamp: new Date().toISOString(),
    }
    const notifPath = join(resolve(process.cwd(), '.mah'), 'notifications', 'latest.json')
    mkdirSync(join(resolve(process.cwd(), '.mah'), 'notifications'), { recursive: true })
    writeFileSync(notifPath, JSON.stringify(notification, null, 2), 'utf-8')
  } catch (err) {
    console.error('Failed to write notification:', err)
  }
}

function writeHeartbeat(phase: string, round: number, startTime: number, sprintId?: string, sprintName?: string): void {
  try {
    const heartbeat: Record<string, unknown> = {
      alive: true,
      phase,
      round,
      elapsed: Date.now() - startTime,
      lastUpdate: new Date().toISOString(),
    }
    if (sprintId) heartbeat.sprintId = sprintId
    if (sprintName) heartbeat.sprintName = sprintName
    const hbPath = join(resolve(process.cwd(), '.mah'), 'heartbeat.json')
    mkdirSync(resolve(process.cwd(), '.mah'), { recursive: true })
    writeFileSync(hbPath, JSON.stringify(heartbeat, null, 2), 'utf-8')
  } catch {
    // Silently fail — heartbeat is best-effort
  }
}

function clearHeartbeat(): void {
  try {
    const hbPath = join(resolve(process.cwd(), '.mah'), 'heartbeat.json')
    if (existsSync(hbPath)) {
      writeFileSync(hbPath, JSON.stringify({ alive: false, lastUpdate: new Date().toISOString() }, null, 2), 'utf-8')
    }
  } catch {
    // ignore
  }
}

function saveTranscript(transcript: SprintTranscript, sprintDir: string, sprintId: string): void {
  const dir = join(sprintDir, sprintId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'transcript.json'), JSON.stringify(transcript, null, 2), 'utf-8')
}

function saveContract(contract: SprintContract, sprintDir: string): void {
  const dir = join(sprintDir, contract.id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'contract.json'), JSON.stringify(contract, null, 2), 'utf-8')
}

function saveContractDirect(contract: SprintContract, sprintFullPath: string): void {
  mkdirSync(sprintFullPath, { recursive: true })
  writeFileSync(join(sprintFullPath, 'contract.json'), JSON.stringify(contract, null, 2), 'utf-8')
}

function saveTranscriptDirect(transcript: SprintTranscript, sprintFullPath: string): void {
  mkdirSync(sprintFullPath, { recursive: true })
  writeFileSync(join(sprintFullPath, 'transcript.json'), JSON.stringify(transcript, null, 2), 'utf-8')
}

function agentResultToPhaseResult(
  result: Awaited<ReturnType<OpenClawAdapter['execute']>>,
  model: string
): PhaseResult {
  return {
    output: result.output,
    startTime: new Date(result.timing.startMs).toISOString(),
    endTime: new Date(result.timing.endMs).toISOString(),
    durationMs: result.timing.durationMs,
    model,
    tokenUsage: result.tokenUsage,
    costEstimate: result.costEstimate,
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

export function aggregateGraderVerdicts(results: GraderResult[]): GraderResult['verdict'] {
  if (results.length === 0) return 'pass'
  if (results.some(r => r.verdict === 'fail')) return 'fail'
  if (results.some(r => r.verdict === 'conditional')) return 'conditional'
  return 'pass'
}

function severityMap(s: 'p0' | 'p1' | 'p2' | 'p3'): GraderResult['findings'][number]['severity'] {
  if (s === 'p0') return 'critical'
  if (s === 'p1') return 'major'
  if (s === 'p2') return 'minor'
  return 'info'
}

function reverseSeverityMap(s: GraderResult['findings'][number]['severity']): 'p0' | 'p1' | 'p2' | 'p3' {
  if (s === 'critical') return 'p0'
  if (s === 'major') return 'p1'
  if (s === 'minor') return 'p2'
  return 'p3'
}

export async function runSprint(
  task: string,
  config: ProjectConfig,
  events: EventLogger,
  options?: { dryRun?: boolean }
): Promise<{ contract: SprintContract; metrics: SprintMetrics }> {
  const sprintId = generateSprintId()
  const sprintDir = resolve(process.cwd(), config.sprints.directory)
  const metricsDir = resolve(process.cwd(), config.metrics.output)

  // 1. Generate contract
  const contract = generateContract(task, config, sprintId)
  events.log('moe', 'milestone', 'contract', `Sprint contract created: ${contract.name}`)
  events.log('moe', 'milestone', 'contract', `Sprint ID: ${contract.id}`)

  // Save initial contract
  saveContract(contract, sprintDir)

  if (options?.dryRun) {
    // Dry run: just print the contract and return stub metrics
    printContractSummary(contract)
    const metrics = createSprintMetrics(contract, config)
    return { contract, metrics }
  }

  const adapter = new OpenClawAdapter()
  let lastDevOutput = ''
  let lastQAOutput = ''
  let currentPhase = 'contract'
  let currentRound = 0
  const sprintStartTime = Date.now()

  // Initialize transcript
  const transcript: SprintTranscript = {
    sprintId: contract.id,
    phases: [],
  }

  // Start heartbeat interval
  writeHeartbeat(currentPhase, currentRound, sprintStartTime, contract.id, contract.name)
  const heartbeatInterval = setInterval(() => {
    writeHeartbeat(currentPhase, currentRound, sprintStartTime, contract.id, contract.name)
  }, 30_000)

  // 3. Dev/QA loop
  for (let round = 1; round <= config.qa.maxIterations; round++) {
    console.log()
    console.log(chalk.bold.white(`  ─── Round ${round} / ${config.qa.maxIterations} ─────────────────────`))

    // 3a. Dev phase
    contract.status = 'dev'
    currentPhase = 'dev'
    currentRound = round
    writeHeartbeat(currentPhase, currentRound, sprintStartTime, contract.id, contract.name)
    events.log('moe', 'spawn', 'dev', `Spawned dev agent R${round}`)

    const devPrompt = round === 1
      ? contractToDevPrompt(contract)
      : contractToDevFixPrompt(contract, lastDevOutput, lastQAOutput, round)

    const devResult = await adapter.execute(devPrompt, {
      model: config.agents.generator.model,
      cwd: config.agents.generator.cwd,
      timeoutMs: 10 * 60 * 1000,
      label: `dev-${contract.id}-r${round}`,
    })

    // Capture dev transcript phase
    const devTranscriptPhase: TranscriptPhase = {
      phase: 'dev',
      round,
      actor: 'dev',
      model: config.agents.generator.model,
      startTime: new Date(devResult.timing.startMs).toISOString(),
      endTime: new Date(devResult.timing.endMs).toISOString(),
      promptSent: devPrompt,
      responseReceived: devResult.output,
      tokenUsage: devResult.tokenUsage,
      costEstimate: devResult.costEstimate,
    }
    transcript.phases.push(devTranscriptPhase)
    saveTranscript(transcript, sprintDir, contract.id)

    const devDuration = formatDuration(devResult.timing.durationMs)
    const devCost = devResult.costEstimate ? `$${devResult.costEstimate.toFixed(4)}` : ''
    events.log('dev', 'output', 'dev', `R${round} complete (${devDuration}${devCost ? ' / ' + devCost : ''})`)

    // 3b. Run all enabled graders
    contract.status = 'qa'
    currentPhase = 'qa'
    writeHeartbeat(currentPhase, currentRound, sprintStartTime, contract.id, contract.name)

    const graderResults: GraderResult[] = []
    // Use graders from contract if present; otherwise fall back to legacy UX-only
    const rawGraders = contract.graders?.filter(g => g.enabled) ?? [
      { id: 'ux-quinn', type: 'ux' as const, name: 'Quinn (UX)', agent: config.agents.evaluator, enabled: true },
    ]
    // Normalize graders: builder puts model flat on grader, pipeline expects grader.agent.model
    const graders = rawGraders.map(g => ({
      ...g,
      agent: g.agent ?? {
        type: 'openclaw' as const,
        model: (g as unknown as Record<string, unknown>).model as string ?? config.agents.evaluator.model,
        workspace: config.agents.evaluator.workspace,
        testUrl: config.agents.evaluator.testUrl,
      },
    }))

    let qaResult: Awaited<ReturnType<OpenClawAdapter['execute']>> | null = null
    let qaOutput = ''

    for (const grader of graders) {
      if (grader.type === 'ux') {
        // ── Quinn (UX) grader ──
        events.log('moe', 'spawn', 'qa', `Spawned ${grader.name} for QA R${round}`)
        const qaPrompt = contractToQAPrompt(contract, devResult.output, round)
        qaResult = await adapter.execute(qaPrompt, {
          model: grader.agent.model,
          cwd: grader.agent.workspace,
          timeoutMs: 10 * 60 * 1000,
          label: `qa-${contract.id}-r${round}`,
        })

        const qaTranscriptPhase: TranscriptPhase = {
          phase: 'qa',
          round,
          actor: 'quinn',
          model: grader.agent.model,
          startTime: new Date(qaResult.timing.startMs).toISOString(),
          endTime: new Date(qaResult.timing.endMs).toISOString(),
          promptSent: qaPrompt,
          responseReceived: qaResult.output,
          tokenUsage: qaResult.tokenUsage,
          costEstimate: qaResult.costEstimate,
        }
        transcript.phases.push(qaTranscriptPhase)
        saveTranscript(transcript, sprintDir, contract.id)

        const qaDuration = formatDuration(qaResult.timing.durationMs)
        const qaCost = qaResult.costEstimate ? `$${qaResult.costEstimate.toFixed(4)}` : ''
        events.log('quinn', 'output', 'qa', `R${round} verdict received (${qaDuration}${qaCost ? ' / ' + qaCost : ''})`)

        // Convert QA report to GraderResult format
        const qaReport = parseQAReport(qaResult.output)
        qaOutput = qaResult.output

        // Map QA defect severities (p0/p1 → fail, etc.) to grader verdict
        let uxVerdict: GraderResult['verdict'] = qaReport.verdict
        if (qaReport.verdict === 'conditional') {
          const hasBlocking = qaReport.defects.some(d => d.severity === 'p0' || d.severity === 'p1')
          if (hasBlocking) uxVerdict = 'fail'
        }

        const uxGraderResult: GraderResult = {
          graderId: grader.id,
          graderType: 'ux',
          graderName: grader.name,
          verdict: uxVerdict,
          findings: qaReport.defects.map((d, i) => ({
            id: d.id,
            severity: severityMap(d.severity),
            category: 'ux',
            description: d.description,
          })),
          summary: qaReport.summary,
          model: grader.agent.model,
          durationMs: qaResult.timing.durationMs,
          costEstimate: qaResult.costEstimate ?? 0,
        }
        graderResults.push(uxGraderResult)

        // Log defect summary
        if (qaReport.defects.length > 0) {
          const defectSummary = qaReport.defects
            .map(d => `${d.id}(${d.severity.toUpperCase()})`)
            .join(', ')
          events.log('quinn', 'output', 'qa', `Defects: ${defectSummary}`)
        }

      } else if (grader.type === 'code-review') {
        // ── Code Review grader ──
        events.log('moe', 'spawn', 'qa', `Spawned ${grader.name} for code review R${round}`)
        const crPrompt = buildCodeReviewPrompt(contract, devResult.output, round)
        const crResult = await adapter.execute(crPrompt, {
          model: grader.agent.model,
          cwd: config.agents.generator.cwd,  // run in repo context
          timeoutMs: 5 * 60 * 1000,
          label: `cr-${contract.id}-r${round}`,
        })

        const crTranscriptPhase: TranscriptPhase = {
          phase: 'qa',
          round,
          actor: 'code-reviewer',
          model: grader.agent.model,
          startTime: new Date(crResult.timing.startMs).toISOString(),
          endTime: new Date(crResult.timing.endMs).toISOString(),
          promptSent: crPrompt,
          responseReceived: crResult.output,
          tokenUsage: crResult.tokenUsage,
          costEstimate: crResult.costEstimate,
        }
        transcript.phases.push(crTranscriptPhase)
        saveTranscript(transcript, sprintDir, contract.id)

        const crDuration = formatDuration(crResult.timing.durationMs)
        const crCost = crResult.costEstimate ? `$${crResult.costEstimate.toFixed(4)}` : ''
        events.log('system', 'output', 'qa', `Code review R${round} complete (${crDuration}${crCost ? ' / ' + crCost : ''})`)

        const crGraderResult = parseCodeReviewResult(
          crResult.output,
          grader.id,
          grader.name,
          grader.agent.model,
          crResult.timing.durationMs,
          crResult.costEstimate ?? 0
        )
        graderResults.push(crGraderResult)
      }
    }

    // 3c. Aggregate verdict across all graders
    const aggregateVerdict = aggregateGraderVerdicts(graderResults)

    // Extract QA defects from UX grader result (for backward compat)
    const uxResult = graderResults.find(r => r.graderType === 'ux')
    const qaDefects = uxResult?.findings.map(f => ({
      id: f.id,
      severity: reverseSeverityMap(f.severity),
      description: f.description,
      fixed: false,
    })) ?? []

    // 3d. Record iteration (backward compatible)
    const iteration: SprintIteration = {
      round,
      dev: agentResultToPhaseResult(devResult, config.agents.generator.model),
      qa: qaResult ? agentResultToPhaseResult(qaResult, uxResult?.model ?? config.agents.evaluator.model) : undefined,
      defects: qaDefects,
      graderResults,
    }
    contract.iterations.push(iteration)

    // 3e. Check aggregate verdict
    if (aggregateVerdict === 'pass') {
      contract.status = 'passed'
      events.log('system', 'milestone', 'metrics',
        `Sprint PASSED in ${round} iteration(s) [all graders passed]`)
      saveContract(contract, sprintDir)
      break
    }

    if (aggregateVerdict === 'conditional') {
      contract.status = 'passed'
      events.log('system', 'milestone', 'metrics',
        `Sprint CONDITIONAL PASS in ${round} iteration(s)`)
      saveContract(contract, sprintDir)
      break
    }

    // Failed — decide whether to loop or escalate
    if (round === config.qa.maxIterations) {
      contract.status = 'escalated'
      events.log('moe', 'decision', 'human',
        `Sprint ESCALATED after ${round} iterations — requires human review`)
      saveContract(contract, sprintDir)
    } else {
      events.log('moe', 'decision', 'dev',
        `QA failed — sending findings back to dev for R${round + 1}`)
      saveContract(contract, sprintDir)
    }

    lastDevOutput = devResult.output
    lastQAOutput = qaOutput
  }

  // 4. Compute metrics
  contract.completedAt = new Date().toISOString()
  const metrics = createSprintMetrics(contract, config)

  // 5. Save everything
  saveContract(contract, sprintDir)
  saveMetrics(metrics, join(sprintDir, contract.id))

  // Also save metrics to the configured metrics directory
  saveMetrics(metrics, metricsDir)

  // 6. Write notification + clear heartbeat
  clearInterval(heartbeatInterval)
  clearHeartbeat()
  writeNotification(contract, metrics)

  return { contract, metrics }
}

/**
 * Run an existing sprint contract (skip contract generation).
 * Used by the dashboard executor when running an approved sprint.
 *
 * @param contract   The pre-existing SprintContract to execute
 * @param config     Project configuration
 * @param events     Event logger
 * @param sprintFullPath  Absolute path to the sprint directory (e.g. .mah/sprints/007-add-kanban)
 */
export async function runExistingContract(
  contract: SprintContract,
  config: ProjectConfig,
  events: EventLogger,
  sprintFullPath: string,
): Promise<{ contract: SprintContract; metrics: SprintMetrics }> {
  const metricsDir = resolve(process.cwd(), config.metrics.output)
  const sprintStartTime = Date.now()

  events.log('moe', 'milestone', 'contract', `Starting sprint: ${contract.name}`)
  events.log('moe', 'milestone', 'contract', `Sprint ID: ${contract.id}`)

  const adapter = new OpenClawAdapter()
  let lastDevOutput = ''
  let lastQAOutput = ''
  let currentPhase = 'dev'
  let currentRound = 0

  const transcript: SprintTranscript = {
    sprintId: contract.id,
    phases: [],
  }

  contract.status = 'dev'
  saveContractDirect(contract, sprintFullPath)

  writeHeartbeat(currentPhase, currentRound, sprintStartTime, contract.id, contract.name)
  const heartbeatInterval = setInterval(() => {
    writeHeartbeat(currentPhase, currentRound, sprintStartTime, contract.id, contract.name)
  }, 30_000)

  // Dev/QA loop — identical logic to runSprint()
  for (let round = 1; round <= config.qa.maxIterations; round++) {
    console.log()
    console.log(chalk.bold.white(`  ─── Round ${round} / ${config.qa.maxIterations} ─────────────────────`))

    // Dev phase
    contract.status = 'dev'
    currentPhase = 'dev'
    currentRound = round
    writeHeartbeat(currentPhase, currentRound, sprintStartTime, contract.id, contract.name)
    events.log('moe', 'spawn', 'dev', `Spawned dev agent R${round}`)

    const devPrompt = round === 1
      ? contractToDevPrompt(contract)
      : contractToDevFixPrompt(contract, lastDevOutput, lastQAOutput, round)

    const devResult = await adapter.execute(devPrompt, {
      model: config.agents.generator.model,
      cwd: config.agents.generator.cwd,
      timeoutMs: 10 * 60 * 1000,
      label: `dev-${contract.id}-r${round}`,
    })

    const devTranscriptPhase: TranscriptPhase = {
      phase: 'dev',
      round,
      actor: 'dev',
      model: config.agents.generator.model,
      startTime: new Date(devResult.timing.startMs).toISOString(),
      endTime: new Date(devResult.timing.endMs).toISOString(),
      promptSent: devPrompt,
      responseReceived: devResult.output,
      tokenUsage: devResult.tokenUsage,
      costEstimate: devResult.costEstimate,
    }
    transcript.phases.push(devTranscriptPhase)
    saveTranscriptDirect(transcript, sprintFullPath)

    const devDuration = formatDuration(devResult.timing.durationMs)
    const devCost = devResult.costEstimate ? `$${devResult.costEstimate.toFixed(4)}` : ''
    events.log('dev', 'output', 'dev', `R${round} complete (${devDuration}${devCost ? ' / ' + devCost : ''})`)

    // QA phase — run all enabled graders
    contract.status = 'qa'
    currentPhase = 'qa'
    writeHeartbeat(currentPhase, currentRound, sprintStartTime, contract.id, contract.name)

    const graderResults: GraderResult[] = []
    const rawGraders = contract.graders?.filter(g => g.enabled) ?? [
      { id: 'ux-quinn', type: 'ux' as const, name: 'Quinn (UX)', agent: config.agents.evaluator, enabled: true },
    ]
    // Normalize graders: builder puts model flat on grader, pipeline expects grader.agent.model
    const graders = rawGraders.map(g => ({
      ...g,
      agent: g.agent ?? {
        type: 'openclaw' as const,
        model: (g as unknown as Record<string, unknown>).model as string ?? config.agents.evaluator.model,
        workspace: config.agents.evaluator.workspace,
        testUrl: config.agents.evaluator.testUrl,
      },
    }))

    let qaResult: Awaited<ReturnType<OpenClawAdapter['execute']>> | null = null
    let qaOutput = ''

    for (const grader of graders) {
      if (grader.type === 'ux') {
        events.log('moe', 'spawn', 'qa', `Spawned ${grader.name} for QA R${round}`)
        const qaPrompt = contractToQAPrompt(contract, devResult.output, round)
        qaResult = await adapter.execute(qaPrompt, {
          model: grader.agent.model,
          cwd: grader.agent.workspace,
          timeoutMs: 10 * 60 * 1000,
          label: `qa-${contract.id}-r${round}`,
        })

        const qaTranscriptPhase: TranscriptPhase = {
          phase: 'qa',
          round,
          actor: 'quinn',
          model: grader.agent.model,
          startTime: new Date(qaResult.timing.startMs).toISOString(),
          endTime: new Date(qaResult.timing.endMs).toISOString(),
          promptSent: qaPrompt,
          responseReceived: qaResult.output,
          tokenUsage: qaResult.tokenUsage,
          costEstimate: qaResult.costEstimate,
        }
        transcript.phases.push(qaTranscriptPhase)
        saveTranscriptDirect(transcript, sprintFullPath)

        const qaDuration = formatDuration(qaResult.timing.durationMs)
        const qaCost = qaResult.costEstimate ? `$${qaResult.costEstimate.toFixed(4)}` : ''
        events.log('quinn', 'output', 'qa', `R${round} verdict received (${qaDuration}${qaCost ? ' / ' + qaCost : ''})`)

        const qaReport = parseQAReport(qaResult.output)
        qaOutput = qaResult.output

        let uxVerdict: GraderResult['verdict'] = qaReport.verdict
        if (qaReport.verdict === 'conditional') {
          const hasBlocking = qaReport.defects.some(d => d.severity === 'p0' || d.severity === 'p1')
          if (hasBlocking) uxVerdict = 'fail'
        }

        const uxGraderResult: GraderResult = {
          graderId: grader.id,
          graderType: 'ux',
          graderName: grader.name,
          verdict: uxVerdict,
          findings: qaReport.defects.map((d) => ({
            id: d.id,
            severity: severityMap(d.severity),
            category: 'ux',
            description: d.description,
          })),
          summary: qaReport.summary,
          model: grader.agent.model,
          durationMs: qaResult.timing.durationMs,
          costEstimate: qaResult.costEstimate ?? 0,
        }
        graderResults.push(uxGraderResult)

        if (qaReport.defects.length > 0) {
          const defectSummary = qaReport.defects
            .map(d => `${d.id}(${d.severity.toUpperCase()})`)
            .join(', ')
          events.log('quinn', 'output', 'qa', `Defects: ${defectSummary}`)
        }

      } else if (grader.type === 'code-review') {
        events.log('moe', 'spawn', 'qa', `Spawned ${grader.name} for code review R${round}`)
        const crPrompt = buildCodeReviewPrompt(contract, devResult.output, round)
        const crResult = await adapter.execute(crPrompt, {
          model: grader.agent.model,
          cwd: config.agents.generator.cwd,
          timeoutMs: 5 * 60 * 1000,
          label: `cr-${contract.id}-r${round}`,
        })

        const crTranscriptPhase: TranscriptPhase = {
          phase: 'qa',
          round,
          actor: 'code-reviewer',
          model: grader.agent.model,
          startTime: new Date(crResult.timing.startMs).toISOString(),
          endTime: new Date(crResult.timing.endMs).toISOString(),
          promptSent: crPrompt,
          responseReceived: crResult.output,
          tokenUsage: crResult.tokenUsage,
          costEstimate: crResult.costEstimate,
        }
        transcript.phases.push(crTranscriptPhase)
        saveTranscriptDirect(transcript, sprintFullPath)

        const crDuration = formatDuration(crResult.timing.durationMs)
        const crCost = crResult.costEstimate ? `$${crResult.costEstimate.toFixed(4)}` : ''
        events.log('system', 'output', 'qa', `Code review R${round} complete (${crDuration}${crCost ? ' / ' + crCost : ''})`)

        const crGraderResult = parseCodeReviewResult(
          crResult.output,
          grader.id,
          grader.name,
          grader.agent.model,
          crResult.timing.durationMs,
          crResult.costEstimate ?? 0
        )
        graderResults.push(crGraderResult)
      }
    }

    const aggregateVerdict = aggregateGraderVerdicts(graderResults)

    const uxResult = graderResults.find(r => r.graderType === 'ux')
    const qaDefects = uxResult?.findings.map(f => ({
      id: f.id,
      severity: reverseSeverityMap(f.severity),
      description: f.description,
      fixed: false,
    })) ?? []

    const iteration: SprintIteration = {
      round,
      dev: agentResultToPhaseResult(devResult, config.agents.generator.model),
      qa: qaResult ? agentResultToPhaseResult(qaResult, uxResult?.model ?? config.agents.evaluator.model) : undefined,
      defects: qaDefects,
      graderResults,
    }
    contract.iterations.push(iteration)

    if (aggregateVerdict === 'pass') {
      contract.status = 'passed'
      events.log('system', 'milestone', 'metrics',
        `Sprint PASSED in ${round} iteration(s) [all graders passed]`)
      saveContractDirect(contract, sprintFullPath)
      break
    }

    if (aggregateVerdict === 'conditional') {
      contract.status = 'passed'
      events.log('system', 'milestone', 'metrics',
        `Sprint CONDITIONAL PASS in ${round} iteration(s)`)
      saveContractDirect(contract, sprintFullPath)
      break
    }

    if (round === config.qa.maxIterations) {
      contract.status = 'escalated'
      events.log('moe', 'decision', 'human',
        `Sprint ESCALATED after ${round} iterations — requires human review`)
      saveContractDirect(contract, sprintFullPath)
    } else {
      events.log('moe', 'decision', 'dev',
        `QA failed — sending findings back to dev for R${round + 1}`)
      saveContractDirect(contract, sprintFullPath)
    }

    lastDevOutput = devResult.output
    lastQAOutput = qaOutput
  }

  // Compute and save metrics
  contract.completedAt = new Date().toISOString()
  const metrics = createSprintMetrics(contract, config)

  saveContractDirect(contract, sprintFullPath)
  saveMetrics(metrics, sprintFullPath)
  saveMetrics(metrics, metricsDir)

  clearInterval(heartbeatInterval)
  clearHeartbeat()
  writeNotification(contract, metrics)

  return { contract, metrics }
}

function printContractSummary(contract: SprintContract): void {
  console.log()
  console.log(chalk.bold.white('  ─── Sprint Contract (dry-run) ─────────────────────'))
  console.log()
  console.log(chalk.bold('  Name:   ') + contract.name)
  console.log(chalk.bold('  ID:     ') + chalk.dim(contract.id))
  console.log(chalk.bold('  Status: ') + chalk.yellow('planned (dry-run)'))
  console.log()

  console.log(chalk.bold('  Task'))
  console.log(chalk.dim('  ' + contract.task.split('\n').join('\n  ')))
  console.log()

  console.log(chalk.bold('  Dev Brief'))
  console.log(`    Repo: ${contract.devBrief.repo}`)
  console.log(`    Constraints:`)
  contract.devBrief.constraints.forEach(c => console.log(`      - ${c}`))
  console.log(`    Definition of Done:`)
  contract.devBrief.definitionOfDone.forEach(d => console.log(`      - ${d}`))
  console.log()

  console.log(chalk.bold('  QA Brief'))
  console.log(`    Tier: ${contract.qaBrief.tier}`)
  if (contract.qaBrief.testUrl) {
    console.log(`    Test URL: ${contract.qaBrief.testUrl}`)
  }
  console.log(`    Pass Criteria:`)
  contract.qaBrief.passCriteria.forEach(p => console.log(`      - ${p}`))
  console.log()
}

export function printSprintSummary(
  contract: SprintContract,
  metrics: SprintMetrics
): void {
  console.log()
  console.log(chalk.bold.white('  ─── Sprint Complete ────────────────────────────────'))
  console.log()

  const verdictColor =
    metrics.verdict === 'pass' ? chalk.green :
    metrics.verdict === 'escalated' ? chalk.yellow :
    chalk.red

  console.log(chalk.bold('  Verdict:    ') + verdictColor(metrics.verdict.toUpperCase()))
  console.log(chalk.bold('  Iterations: ') + metrics.totals.iterations)
  console.log(chalk.bold('  Duration:   ') + formatDuration(metrics.totals.durationMs))
  console.log(chalk.bold('  Cost:       ') + `$${metrics.totals.estimatedCost.toFixed(4)}`)

  const totalDefects =
    metrics.quality.defectsFound.p0 +
    metrics.quality.defectsFound.p1 +
    metrics.quality.defectsFound.p2 +
    metrics.quality.defectsFound.p3

  if (totalDefects > 0) {
    console.log(chalk.bold('  Defects:    ') + `${totalDefects} found`)
    const { p0, p1, p2, p3 } = metrics.quality.defectsFound
    if (p0) console.log(`    ${chalk.red('P0:')} ${p0}`)
    if (p1) console.log(`    ${chalk.yellow('P1:')} ${p1}`)
    if (p2) console.log(`    P2: ${p2}`)
    if (p3) console.log(`    ${chalk.dim('P3:')} ${p3}`)
  }

  console.log()
  console.log(chalk.dim(`  Sprint ID: ${contract.id}`))
  console.log()
}
