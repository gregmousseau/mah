/**
 * MAH Chain Execution Engine
 * Runs a sequence of chained sprints, injecting upstream artifacts into downstream prompts
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
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
import { createSprintMetrics, saveMetrics } from './metrics.js'
import { loadSkills, resolveSkillsForPrompt } from './skills.js'
import { loadNamedAgents } from './config.js'
import { extractArtifacts, saveArtifacts, resolveInputs, buildInputContext } from './artifacts.js'
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
  SprintArtifact,
  SprintInput,
  AgentAssignment,
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
  const adapter = new OpenClawAdapter()
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

  for (let round = 1; round <= config.qa.maxIterations; round++) {
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

    const devResult = await adapter.execute(devPrompt, {
      model: config.agents.generator.model,
      cwd: config.agents.generator.cwd,
      timeoutMs: 10 * 60 * 1000,
      label: `chain-dev-${contract.id}-r${round}`,
    })

    transcript.phases.push({
      phase: 'dev',
      round,
      actor: 'dev',
      model: config.agents.generator.model,
      startTime: new Date(devResult.timing.startMs).toISOString(),
      endTime: new Date(devResult.timing.endMs).toISOString(),
      promptSent: devPrompt.slice(0, 500) + '...',
      responseReceived: devResult.output,
      tokenUsage: devResult.tokenUsage,
      costEstimate: devResult.costEstimate,
    })

    const devDuration = formatDuration(devResult.timing.durationMs)
    events.log('dev', 'output', 'dev', `R${round} complete (${devDuration})`)

    // QA phase
    contract.status = 'qa'
    const qaPrompt = contractToQAPrompt(contract, devResult.output, round)
    const qaResult = await adapter.execute(qaPrompt, {
      model: config.agents.evaluator.model,
      cwd: config.agents.evaluator.workspace,
      timeoutMs: 10 * 60 * 1000,
      label: `chain-qa-${contract.id}-r${round}`,
    })

    transcript.phases.push({
      phase: 'qa',
      round,
      actor: 'quinn',
      model: config.agents.evaluator.model,
      startTime: new Date(qaResult.timing.startMs).toISOString(),
      endTime: new Date(qaResult.timing.endMs).toISOString(),
      promptSent: qaPrompt.slice(0, 500) + '...',
      responseReceived: qaResult.output,
      tokenUsage: qaResult.tokenUsage,
      costEstimate: qaResult.costEstimate,
    })

    const qaReport = parseQAReport(qaResult.output)
    const qaDuration = formatDuration(qaResult.timing.durationMs)
    events.log('quinn', 'output', 'qa', `R${round} verdict: ${qaReport.verdict} (${qaDuration})`)

    // Record iteration
    const iteration: SprintIteration = {
      round,
      dev: {
        output: devResult.output,
        startTime: new Date(devResult.timing.startMs).toISOString(),
        endTime: new Date(devResult.timing.endMs).toISOString(),
        durationMs: devResult.timing.durationMs,
        model: config.agents.generator.model,
        tokenUsage: devResult.tokenUsage,
        costEstimate: devResult.costEstimate,
      },
      qa: {
        output: qaResult.output,
        startTime: new Date(qaResult.timing.startMs).toISOString(),
        endTime: new Date(qaResult.timing.endMs).toISOString(),
        durationMs: qaResult.timing.durationMs,
        model: config.agents.evaluator.model,
        tokenUsage: qaResult.tokenUsage,
        costEstimate: qaResult.costEstimate,
      },
      defects: qaReport.defects,
    }
    contract.iterations.push(iteration)

    if (qaReport.verdict === 'pass' || qaReport.verdict === 'conditional') {
      contract.status = 'passed'
      break
    }

    if (round === config.qa.maxIterations) {
      contract.status = 'escalated'
    }

    lastDevOutput = devResult.output
    lastQAOutput = qaResult.output
  }

  // Save everything
  contract.completedAt = new Date().toISOString()
  writeFileSync(join(sprintFullDir, 'contract.json'), JSON.stringify(contract, null, 2))
  writeFileSync(join(sprintFullDir, 'transcript.json'), JSON.stringify(transcript, null, 2))

  const metrics = createSprintMetrics(contract, config)
  saveMetrics(metrics, sprintFullDir)
  saveMetrics(metrics, metricsDir)

  return { contract, metrics }
}

// ─── Helpers ───

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
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
