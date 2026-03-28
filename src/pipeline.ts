import { writeFileSync, mkdirSync } from 'node:fs'
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
import { EventLogger } from './events.js'
import type {
  ProjectConfig,
  SprintContract,
  SprintMetrics,
  SprintIteration,
  PhaseResult,
} from './types.js'

function saveContract(contract: SprintContract, sprintDir: string): void {
  const dir = join(sprintDir, contract.id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'contract.json'), JSON.stringify(contract, null, 2), 'utf-8')
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

  // 3. Dev/QA loop
  for (let round = 1; round <= config.qa.maxIterations; round++) {
    console.log()
    console.log(chalk.bold.white(`  ─── Round ${round} / ${config.qa.maxIterations} ─────────────────────`))

    // 3a. Dev phase
    contract.status = 'dev'
    events.log('moe', 'spawn', 'dev', `Spawned dev agent R${round}`)

    const devPrompt = round === 1
      ? contractToDevPrompt(contract)
      : contractToDevFixPrompt(contract, lastDevOutput, lastQAOutput, round)

    const devResult = await adapter.execute(devPrompt, {
      model: config.agents.generator.model,
      cwd: config.agents.generator.cwd,
      timeoutMs: 30 * 60 * 1000,
      label: `dev-${contract.id}-r${round}`,
    })

    const devDuration = formatDuration(devResult.timing.durationMs)
    const devCost = devResult.costEstimate ? `$${devResult.costEstimate.toFixed(4)}` : ''
    events.log('dev', 'output', 'dev', `R${round} complete (${devDuration}${devCost ? ' / ' + devCost : ''})`)

    // 3b. QA phase
    contract.status = 'qa'
    events.log('moe', 'spawn', 'qa', `Spawned Quinn for QA R${round}`)

    const qaPrompt = contractToQAPrompt(contract, devResult.output, round)
    const qaResult = await adapter.execute(qaPrompt, {
      model: config.agents.evaluator.model,
      cwd: config.agents.evaluator.workspace,
      timeoutMs: 30 * 60 * 1000,
      label: `qa-${contract.id}-r${round}`,
    })

    const qaDuration = formatDuration(qaResult.timing.durationMs)
    const qaCost = qaResult.costEstimate ? `$${qaResult.costEstimate.toFixed(4)}` : ''
    events.log('quinn', 'output', 'qa', `R${round} verdict received (${qaDuration}${qaCost ? ' / ' + qaCost : ''})`)

    // 3c. Parse QA report
    const qaReport = parseQAReport(qaResult.output)

    // 3d. Record iteration
    const iteration: SprintIteration = {
      round,
      dev: agentResultToPhaseResult(devResult, config.agents.generator.model),
      qa: agentResultToPhaseResult(qaResult, config.agents.evaluator.model),
      defects: qaReport.defects,
    }
    contract.iterations.push(iteration)

    // Log defect summary
    if (qaReport.defects.length > 0) {
      const defectSummary = qaReport.defects
        .map(d => `${d.id}(${d.severity.toUpperCase()})`)
        .join(', ')
      events.log('quinn', 'output', 'qa', `Defects: ${defectSummary}`)
    }

    // 3e. Check verdict
    if (qaReport.verdict === 'pass') {
      contract.status = 'passed'
      events.log('system', 'milestone', 'metrics',
        `Sprint PASSED in ${round} iteration(s)`)
      saveContract(contract, sprintDir)
      break
    }

    if (qaReport.verdict === 'conditional') {
      const hasBlocking = qaReport.defects.some(
        d => d.severity === 'p0' || d.severity === 'p1'
      )
      if (!hasBlocking) {
        contract.status = 'passed'
        events.log('system', 'milestone', 'metrics',
          `Sprint CONDITIONAL PASS in ${round} iteration(s)`)
        saveContract(contract, sprintDir)
        break
      }
      // Blocking defects in a conditional — treat as fail and loop
      events.log('moe', 'decision', 'dev',
        `Conditional PASS but has blocking defects — continuing to R${round + 1}`)
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
    lastQAOutput = qaResult.output
  }

  // 4. Compute metrics
  contract.completedAt = new Date().toISOString()
  const metrics = createSprintMetrics(contract, config)

  // 5. Save everything
  saveContract(contract, sprintDir)
  saveMetrics(metrics, join(sprintDir, contract.id))

  // Also save metrics to the configured metrics directory
  saveMetrics(metrics, metricsDir)

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
