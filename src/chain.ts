/**
 * MAH Chain Execution Engine
 * Runs a sequence of chained sprints, injecting upstream artifacts into downstream prompts
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import chalk from 'chalk'
import { createAgentAdapter, preflightAdapter } from './adapters/factory.js'
import {
  generateContract,
  generateSprintId,
  contractToDevPrompt,
  contractToQAPrompt,
  contractToDevFixPrompt,
} from './contract.js'
import { hasExplicitQAVerdict, parseQAReport } from './parser.js'
import { buildCodeReviewPrompt, parseCodeReviewResult } from './graders/code-review.js'
import { createSprintMetrics, saveMetrics } from './metrics.js'
import { loadSkills, resolveSkillsForPrompt } from './skills.js'
import { loadNamedAgents, resolveVerdictMode } from './config.js'
import { budgetForContract, bumpTier, parseDevEscalation } from './lib/qaTier.js'
import { extractArtifacts, saveArtifacts, resolveInputs, buildInputContext } from './artifacts.js'
import { EventLogger } from './events.js'
import {
  buildConsolidatedRepairBrief,
  classifyDeliveryError,
  evaluateDeliveryVerdict,
  failedGraderResult,
  inspectDeliveryPreflight,
  materialGraderFindings,
  verifyDeliveryIdentity,
} from './reliability.js'
import type {
  ProjectConfig,
  SprintContract,
  SprintMetrics,
  SprintIteration,
  PhaseResult,
  SprintTranscript,
  TranscriptPhase,
  GraderResult,
  SprintArtifact,
  SprintInput,
  AgentAssignment,
  DeliveryFailure,
  AgentResult,
} from './types.js'
import type { ProposedSprint, SprintProposal } from './planner.js'
import type { ResolvedSkill } from './skills.js'

// ─── Types ───

export interface ChainResult {
  sprints: { contract: SprintContract; metrics: SprintMetrics }[]
  totalCost: number
  totalDurationMs: number
  allPassed: boolean
  stoppedAtIndex?: number
  stoppedReason?: string
}

// ─── Chain Runner ───

export async function runChain(
  proposal: SprintProposal,
  config: ProjectConfig,
  events: EventLogger,
  options?: {
    autoApproveCheckpoints?: boolean
    onCheckpoint?: (sprintIndex: number, contract: SprintContract) => Promise<boolean>
  },
): Promise<ChainResult> {
  config.qa.verdictMode = resolveVerdictMode(config.qa.verdictMode)
  const results: ChainResult['sprints'] = []
  const sprintDir = resolve(process.cwd(), config.sprints.directory)
  const metricsDir = resolve(process.cwd(), config.metrics.output)
  const mahRoot = process.cwd()

  // Load skills once for the whole chain
  const allSkills = loadSkills(mahRoot)

  events.log('moe', 'milestone', 'contract',
    `Starting chain: ${proposal.sprints.length} sprints`)

  // Track artifacts produced by each sprint for downstream injection
  const artifactsBySprintName = new Map<string, SprintArtifact[]>()

  for (let i = 0; i < proposal.sprints.length; i++) {
    const proposed = proposal.sprints[i]

    console.log()
    console.log(chalk.bold.cyan(`  ═══ Chain Sprint ${i + 1}/${proposal.sprints.length}: ${proposed.name} ═══`))

    // Build inputs from upstream sprints
    const inputs: SprintInput[] = []
    if (proposed.inputsFrom) {
      for (const upstreamName of proposed.inputsFrom) {
        const upstreamArtifacts = artifactsBySprintName.get(upstreamName)
        if (upstreamArtifacts) {
          for (const artifact of upstreamArtifacts) {
            inputs.push({
              from: `${upstreamName}.${artifact.id}`,
              injectAs: artifact.type === 'file' ? 'reference' : 'context',
              resolved: artifact.content ?? `File: ${artifact.path} — ${artifact.description}`,
            })
          }
        }
      }
    }

    // Generate contract for this sprint
    const sprintId = generateSprintId()
    const contract = generateContract(proposed.task, config, sprintId)
    contract.name = proposed.name
    contract.agentAssignments = proposed.agents
    contract.inputs = inputs.length > 0 ? inputs : undefined
    contract.humanCheckpoint = proposed.humanCheckpoint
    contract.qaBrief.tier = proposed.qaTier

    // Resolve skills for this sprint's agents
    const genAssignment = proposed.agents.find(a => a.role === 'generator' || a.role === 'researcher')
    const skillNames = genAssignment?.skills ?? []
    const resolvedSkills = resolveSkillsForPrompt(skillNames, allSkills, mahRoot)

    if (resolvedSkills.length > 0) {
      events.log('moe', 'milestone', 'contract',
        `Sprint ${i + 1} skills: ${resolvedSkills.map(s => s.name).join(', ')}`)
    }

    // Run the sprint
    const sprintResult = await runChainSprint(
      contract, config, events, resolvedSkills, inputs, sprintDir, metricsDir
    )

    results.push(sprintResult)

    // Extract and store artifacts
    if (sprintResult.contract.status === 'passed') {
      const lastDev = sprintResult.contract.iterations[sprintResult.contract.iterations.length - 1]?.dev
      if (lastDev) {
        const artifacts = extractArtifacts(lastDev.output, sprintResult.contract.id)

        // Also add any declared expected outputs as summary artifacts
        if (proposed.expectedOutputs) {
          for (const expected of proposed.expectedOutputs) {
            if (!artifacts.some(a => a.id.includes(expected.id))) {
              artifacts.push({
                id: expected.id,
                type: 'summary',
                content: lastDev.output, // full dev output as content for downstream use
                description: expected.description,
              })
            }
          }
        }

        artifactsBySprintName.set(proposed.name, artifacts)
        const sprintFullDir = join(sprintDir, sprintResult.contract.id)
        saveArtifacts(artifacts, sprintFullDir)
        events.log('system', 'milestone', 'metrics',
          `Sprint ${i + 1}: ${artifacts.length} artifact(s) for downstream use`)
      }
    }

    // Check for failure
    if (sprintResult.contract.status !== 'passed') {
      events.log('moe', 'decision', 'human',
        `Chain stopped at sprint ${i + 1}: ${sprintResult.contract.status}`)
      return {
        sprints: results,
        totalCost: results.reduce((sum, r) => sum + r.metrics.totals.estimatedCost, 0),
        totalDurationMs: results.reduce((sum, r) => sum + r.metrics.totals.durationMs, 0),
        allPassed: false,
        stoppedAtIndex: i,
        stoppedReason: `Sprint ${i + 1} ${sprintResult.contract.status}`,
      }
    }

    // Human checkpoint
    if (proposed.humanCheckpoint && !options?.autoApproveCheckpoints) {
      events.log('moe', 'decision', 'human',
        `Checkpoint after sprint ${i + 1} — awaiting human approval`)

      if (options?.onCheckpoint) {
        const approved = await options.onCheckpoint(i, sprintResult.contract)
        if (!approved) {
          return {
            sprints: results,
            totalCost: results.reduce((sum, r) => sum + r.metrics.totals.estimatedCost, 0),
            totalDurationMs: results.reduce((sum, r) => sum + r.metrics.totals.durationMs, 0),
            allPassed: false,
            stoppedAtIndex: i,
            stoppedReason: 'Human rejected at checkpoint',
          }
        }
      } else {
        // CLI mode: just log it and continue (no stdin reading in non-interactive)
        console.log(chalk.yellow(`\n  ⏸ Human checkpoint — review sprint ${i + 1} output before continuing`))
        console.log(chalk.dim('  (auto-continuing in chain mode)'))
      }
    }
  }

  const totalCost = results.reduce((sum, r) => sum + r.metrics.totals.estimatedCost, 0)
  const totalDurationMs = results.reduce((sum, r) => sum + r.metrics.totals.durationMs, 0)

  events.log('system', 'milestone', 'metrics',
    `Chain complete: ${results.length} sprints, $${totalCost.toFixed(4)}, ${formatDuration(totalDurationMs)}`)

  return {
    sprints: results,
    totalCost,
    totalDurationMs,
    allPassed: true,
  }
}

// ─── Single Sprint within a Chain ───

async function runChainSprint(
  contract: SprintContract,
  config: ProjectConfig,
  events: EventLogger,
  skills: ResolvedSkill[],
  inputs: SprintInput[],
  sprintDir: string,
  metricsDir: string,
): Promise<{ contract: SprintContract; metrics: SprintMetrics }> {
  const generatorAdapter = createAgentAdapter(config.agents.generator)
  let lastDevOutput = ''
  let lastQAOutput = ''
  const sprintStartTime = Date.now()

  // Build input context from upstream artifacts
  const inputContext = buildInputContext(inputs)

  // Save initial contract
  const sprintFullDir = join(sprintDir, contract.id)
  mkdirSync(sprintFullDir, { recursive: true })
  writeFileSync(join(sprintFullDir, 'contract.json'), JSON.stringify(contract, null, 2))

  const transcript: SprintTranscript = {
    sprintId: contract.id,
    phases: [],
  }

  events.log('moe', 'spawn', 'dev', `Sprint ${contract.name} starting`)

  let chainCrashError: Error | null = null
  let lastChainPhase = 'pre-dev'
  try {
  await preflightAdapter(generatorAdapter, config.agents.generator)
  for (let round = 1; round <= config.qa.maxIterations; round++) {
    lastChainPhase = `dev R${round}`
    // Dev phase
    contract.status = 'dev'
    events.log('moe', 'spawn', 'dev', `Dev R${round}`)

    let devPrompt = round === 1
      ? contractToDevPrompt(contract, skills)
      : contractToDevFixPrompt(contract, lastDevOutput, lastQAOutput, round)

    // Prepend input context from upstream artifacts
    if (inputContext) {
      devPrompt = inputContext + devPrompt
    }

    const devResult = await generatorAdapter.execute(devPrompt, {
      model: config.agents.generator.model,
      cwd: config.agents.generator.cwd,
      timeoutMs: 10 * 60 * 1000,
      label: `chain-dev-${contract.id}-r${round}`,
    })

    transcript.phases.push({
      phase: 'dev',
      round,
      actor: 'dev',
      model: devResult.model ?? config.agents.generator.model,
      provider: devResult.provider,
      startTime: new Date(devResult.timing.startMs).toISOString(),
      endTime: new Date(devResult.timing.endMs).toISOString(),
      promptSent: devPrompt.slice(0, 500) + '...',
      responseReceived: devResult.output,
      tokenUsage: devResult.tokenUsage,
      costEstimate: devResult.costEstimate,
    })

    const devDuration = formatDuration(devResult.timing.durationMs)
    events.log('dev', 'output', 'dev', `R${round} complete (${devDuration})`)
    if (!devResult.success) throw new Error(`Dev agent failed before QA: ${devResult.output.slice(0, 500)}`)

    // Dev-driven QA escalation: if dev flagged risk, bump the QA tier before Quinn runs.
    const devEscalation = parseDevEscalation(devResult.output)
    if (devEscalation) {
      const fromTier = contract.qaBrief.tier
      const toTier = bumpTier(fromTier, devEscalation.tierRequest)
      if (toTier !== fromTier) {
        contract.qaBrief.tier = toTier
        events.log('dev', 'decision', 'qa',
          `QA escalation: ${fromTier} → ${toTier} (${devEscalation.reason || 'no reason given'})`)
      }
    }

    // QA phase
    const candidateIdentity = config.qa.verdictMode === 'legacy'
      ? undefined
      : inspectDeliveryPreflight(
          config.agents.generator.cwd ?? contract.devBrief.repo,
          { ignoredStatePaths: [resolve(config.sprints.directory), resolve(config.metrics.output)] },
        ).identity
    if (candidateIdentity) {
      contract.activeCandidateIdentity = candidateIdentity
      contract.activeCandidateRound = round
      writeFileSync(join(sprintFullDir, 'contract.json'), JSON.stringify(contract, null, 2))
    }
    lastChainPhase = `qa R${round}`
    contract.status = 'qa'
    const graders = contract.graders?.filter((grader) => grader.enabled) ?? [{
      id: 'ux-quinn',
      type: 'ux' as const,
      name: 'Quinn (UX)',
      enabled: true,
      agent: config.agents.evaluator,
    }]
    const graderResults: GraderResult[] = []
    const uxGrader = graders.find((grader) => grader.type === 'ux')
    let qaResult: AgentResult | undefined
    if (uxGrader) {
      const qaPrompt = contractToQAPrompt(contract, devResult.output, round)
      const tierBudget = budgetForContract(contract)
      const uxAdapter = createAgentAdapter(uxGrader.agent)
      await preflightAdapter(uxAdapter, uxGrader.agent)
      qaResult = await uxAdapter.execute(qaPrompt, {
        model: uxGrader.agent.model,
        cwd: uxGrader.agent.workspace,
        timeoutMs: tierBudget.timeoutMs,
        label: `chain-qa-${contract.id}-r${round}`,
      })
      transcript.phases.push({
        phase: 'qa',
        round,
        actor: 'quinn',
        model: qaResult.model ?? uxGrader.agent.model,
        provider: qaResult.provider,
        startTime: new Date(qaResult.timing.startMs).toISOString(),
        endTime: new Date(qaResult.timing.endMs).toISOString(),
        promptSent: qaPrompt.slice(0, 500) + '...',
        responseReceived: qaResult.output,
        tokenUsage: qaResult.tokenUsage,
        costEstimate: qaResult.costEstimate,
      })
      const qaReport = parseQAReport(qaResult.output)
      if (!qaResult.success) {
        graderResults.push(failedGraderResult(uxGrader, qaResult.output || 'Chain QA agent failed.', qaResult))
      } else {
        graderResults.push({
          graderId: uxGrader.id,
          graderType: 'ux',
          graderName: uxGrader.name,
          verdict: qaReport.verdict,
          findings: qaReport.defects.map((defect) => ({
            id: defect.id,
            severity: chainFindingSeverity(defect.severity),
            category: 'ux',
            description: defect.description,
          })),
          summary: qaReport.summary,
          model: qaResult.model ?? uxGrader.agent.model,
          provider: qaResult.provider,
          durationMs: qaResult.timing.durationMs,
          costEstimate: qaResult.costEstimate ?? 0,
          executionStatus: hasExplicitQAVerdict(qaResult.output) ? 'completed' : 'missing',
        })
      }
    }

    for (const grader of graders.filter((candidate) => candidate.type === 'code-review')) {
      let graderExecution: AgentResult | undefined
      try {
        const crPrompt = buildCodeReviewPrompt(contract, devResult.output, round)
        const graderAdapter = createAgentAdapter(grader.agent)
        await preflightAdapter(graderAdapter, grader.agent)
        const crResult = await graderAdapter.execute(crPrompt, {
          model: grader.agent.model,
          cwd: config.agents.generator.cwd,
          timeoutMs: 5 * 60 * 1000,
          label: `cr-${contract.id}-r${round}`,
        })
        graderExecution = crResult
        transcript.phases.push({
          phase: 'qa',
          round,
          actor: 'code-reviewer',
          model: crResult.model ?? grader.agent.model,
          provider: crResult.provider,
          startTime: new Date(crResult.timing.startMs).toISOString(),
          endTime: new Date(crResult.timing.endMs).toISOString(),
          promptSent: crPrompt.slice(0, 500) + '...',
          responseReceived: crResult.output,
          tokenUsage: crResult.tokenUsage,
          costEstimate: crResult.costEstimate,
        })
        if (!crResult.success) throw new Error(crResult.output || `${grader.name} failed`)
        const parsedReview = parseCodeReviewResult(
          crResult.output,
          grader.id,
          grader.name,
          crResult.model ?? grader.agent.model,
          crResult.timing.durationMs,
          crResult.costEstimate ?? 0,
        )
        parsedReview.provider = crResult.provider
        graderResults.push(parsedReview)
      } catch (error) {
        graderResults.push(failedGraderResult(grader, error, graderExecution))
      }
    }

    const delivery = evaluateDeliveryVerdict(graders, graderResults, config.qa.verdictMode)
    const deliveryFailures: DeliveryFailure[] = [...delivery.failures]
    if (candidateIdentity) {
      const failure = verifyDeliveryIdentity(
        config.agents.generator.cwd ?? contract.devBrief.repo,
        candidateIdentity,
        { ignoredStatePaths: [resolve(config.sprints.directory), resolve(config.metrics.output)] },
        `chain-qa-r${round}-final-preflight`,
      )
      if (failure) deliveryFailures.push(failure)
    }
    const effectiveVerdict = deliveryFailures.length > 0 ? 'fail' : delivery.verdict
    const qaDuration = qaResult ? formatDuration(qaResult.timing.durationMs) : 'no UX grader'
    events.log('quinn', 'output', 'qa', `R${round} verdict: ${effectiveVerdict} (${qaDuration})`)

    // Record iteration
    const iteration: SprintIteration = {
      round,
      dev: {
        output: devResult.output,
        startTime: new Date(devResult.timing.startMs).toISOString(),
        endTime: new Date(devResult.timing.endMs).toISOString(),
        durationMs: devResult.timing.durationMs,
        model: devResult.model ?? config.agents.generator.model,
        provider: devResult.provider,
        tokenUsage: devResult.tokenUsage,
        costEstimate: devResult.costEstimate,
      },
      qa: qaResult ? {
        output: qaResult.output,
        startTime: new Date(qaResult.timing.startMs).toISOString(),
        endTime: new Date(qaResult.timing.endMs).toISOString(),
        durationMs: qaResult.timing.durationMs,
        model: qaResult.model ?? uxGrader?.agent.model ?? config.agents.evaluator.model,
        provider: qaResult.provider,
        tokenUsage: qaResult.tokenUsage,
        costEstimate: qaResult.costEstimate,
      } : undefined,
      defects: materialGraderFindings(graderResults).map((finding) => ({
        id: finding.id,
        severity: chainDefectSeverity(finding.severity),
        description: finding.description,
        fixed: false,
      })),
      graderResults,
      deliveryFailures,
      candidateIdentity,
    }
    contract.iterations.push(iteration)

    if (
      effectiveVerdict === 'pass' ||
      (effectiveVerdict === 'conditional' && config.qa.verdictMode === 'legacy')
    ) {
      contract.status = 'passed'
      break
    }

    if (round === config.qa.maxIterations) {
      contract.status = 'escalated'
    }

    lastDevOutput = devResult.output
    lastQAOutput = buildConsolidatedRepairBrief(graderResults, deliveryFailures)
  }
  } catch (err) {
    chainCrashError = err as Error
    contract.status = 'failed'
    contract.deliveryFailures = [classifyDeliveryError(err, lastChainPhase)]
    events.log('moe', 'error', 'metrics',
      `Chain sprint crashed during ${lastChainPhase}: ${chainCrashError.message}`)
  }

  // Save everything (always — even on crash)
  contract.completedAt = new Date().toISOString()
  writeFileSync(join(sprintFullDir, 'contract.json'), JSON.stringify(contract, null, 2))
  writeFileSync(join(sprintFullDir, 'transcript.json'), JSON.stringify(transcript, null, 2))

  const metrics = createSprintMetrics(contract, config)
  saveMetrics(metrics, sprintFullDir)
  saveMetrics(metrics, metricsDir)
  if (chainCrashError) throw chainCrashError

  return { contract, metrics }
}

// ─── Helpers ───

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function chainFindingSeverity(severity: 'p0' | 'p1' | 'p2' | 'p3'): 'critical' | 'major' | 'minor' | 'info' {
  if (severity === 'p0') return 'critical'
  if (severity === 'p1') return 'major'
  if (severity === 'p2') return 'minor'
  return 'info'
}

function chainDefectSeverity(severity: 'critical' | 'major' | 'minor' | 'info'): 'p0' | 'p1' | 'p2' | 'p3' {
  if (severity === 'critical') return 'p0'
  if (severity === 'major') return 'p1'
  if (severity === 'minor') return 'p2'
  return 'p3'
}

// ─── Format Chain Results ───

export function formatChainResult(result: ChainResult): string {
  const lines: string[] = []

  lines.push(result.allPassed
    ? chalk.green.bold('Chain PASSED')
    : chalk.red.bold(`Chain STOPPED at sprint ${(result.stoppedAtIndex ?? 0) + 1}`)
  )

  lines.push(`Total: ${result.sprints.length} sprint(s), $${result.totalCost.toFixed(4)}, ${formatDuration(result.totalDurationMs)}`)

  if (result.stoppedReason) {
    lines.push(chalk.yellow(`Reason: ${result.stoppedReason}`))
  }

  lines.push('')
  for (let i = 0; i < result.sprints.length; i++) {
    const { contract, metrics } = result.sprints[i]
    const status = contract.status === 'passed' ? chalk.green('PASS') : chalk.red(contract.status.toUpperCase())
    lines.push(`  Sprint ${i + 1}: ${contract.name} [${status}] — $${metrics.totals.estimatedCost.toFixed(4)}, ${formatDuration(metrics.totals.durationMs)}`)
  }

  return lines.join('\n')
}
