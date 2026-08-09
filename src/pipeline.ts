import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import chalk from 'chalk'
import { createAgentAdapter, preflightAdapter } from './adapters/factory.js'
import {
  generateContract,
  generateSprintId,
  contractToDevPrompt,
  contractToQAPrompt,
  contractToDevFixPrompt,
} from './contract.js'
import { loadSkills, resolveSkillRoot, resolveSkillsForPrompt } from './skills.js'
import { extractArtifacts, saveArtifacts, resolveInputs, buildInputContext } from './artifacts.js'
import { loadNamedAgents, resolveVerdictMode } from './config.js'
import { getAgentName } from './lib/agentRegistry.js'
import type { ResolvedSkill } from './skills.js'
import { hasExplicitQAVerdict, parseQAReport } from './parser.js'
import { buildCodeReviewPrompt, parseCodeReviewResult } from './graders/code-review.js'
import { createSprintMetrics, saveMetrics } from './metrics.js'
import { EventLogger } from './events.js'
import { budgetForContract, bumpTier, parseDevEscalation } from './lib/qaTier.js'
import {
  boundTranscriptResponse,
  devExecuteOptions,
} from './execution-policy.js'
import {
  RECOVERABLE_CHECKPOINT_CODE,
  loadRecoverableCheckpoint,
  persistRecoverableCheckpoint,
  recoverableCheckpointError,
  verifyQAOnlyResume,
} from './checkpoint.js'
import type { QAOnlyResumeRequest } from './checkpoint.js'
import {
  repairScopedGraderResults,
} from './registrar/routing.js'
import { processScopeAwareFindingRound } from './registrar/round.js'
import { preflightEnabledGraders, resolveEnabledGraders } from './grader-config.js'
import {
  buildConsolidatedRepairBrief,
  buildDeliveryEvaluationProvenance,
  assertDeliveryIdentity,
  canResumeQAWithPinnedCandidate,
  classifyDeliveryError,
  evaluateDeliveryVerdict,
  failedGraderResult,
  hasCompleteRequiredGraderResults,
  identityMismatch,
  inspectDeliveryPreflight,
  inspectExecutionPreflight,
  materialGraderFindings,
  restoreRepairFeedback,
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
  AgentResult,
  DeliveryIdentity,
} from './types.js'

export {
  repairScopedGraderResults,
  registrarHarnessFailures,
  scopeAwareVerdict,
} from './registrar/routing.js'

function writeNotification(
  contract: SprintContract,
  metrics: SprintMetrics,
  crashError?: Error | null,
): void {
  try {
    const notification = {
      type: crashError ? 'sprint_crashed' : 'sprint_complete',
      sprintId: contract.id,
      name: contract.name,
      verdict: contract.status,
      iterations: contract.iterations.length,
      cost: metrics.totals.estimatedCost,
      duration: metrics.totals.durationMs,
      timestamp: new Date().toISOString(),
      ...(crashError ? { error: { message: crashError.message, stack: crashError.stack } } : {}),
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
  result: AgentResult,
  model: string
): PhaseResult {
  return {
    output: result.output,
    startTime: new Date(result.timing.startMs).toISOString(),
    endTime: new Date(result.timing.endMs).toISOString(),
    durationMs: result.timing.durationMs,
    model: result.model ?? model,
    provider: result.provider,
    tokenUsage: result.tokenUsage,
    costEstimate: result.costEstimate,
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
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

export interface RunSprintResult {
  contract: SprintContract
  metrics: SprintMetrics
  crashError?: Error
}

export async function runSprint(
  task: string,
  config: ProjectConfig,
  events: EventLogger,
  options?: { dryRun?: boolean }
): Promise<RunSprintResult> {
  config.qa.verdictMode = resolveVerdictMode(config.qa.verdictMode)
  const sprintId = generateSprintId()
  const sprintDir = resolve(process.cwd(), config.sprints.directory)
  const metricsDir = resolve(process.cwd(), config.metrics.output)

  // 1. Generate contract
  const contract = generateContract(task, config, sprintId)

  // Hydrate agentConfig from yaml when the contract didn't already specify one.
  // Lets `agents.generator.agentId: awc` in mah.yaml drive Aria (or any registry
  // agent) without the planner having to set it.
  if (!contract.agentConfig) {
    const genId = config.agents.generator.agentId
    const evalId = config.agents.evaluator.agentId
    if (genId || evalId) {
      contract.agentConfig = {
        generator: { agentId: genId ?? '', agentName: (genId && getAgentName(genId)) || genId || '' },
        evaluator: { agentId: evalId ?? '', agentName: (evalId && getAgentName(evalId)) || evalId || '' },
      }
    }
  }

  events.log('moe', 'milestone', 'contract', `Sprint contract created: ${contract.name}`)
  events.log('moe', 'milestone', 'contract', `Sprint ID: ${contract.id}`)
  if (contract.agentConfig?.generator.agentId) {
    events.log('moe', 'milestone', 'contract', `Generator agent: ${contract.agentConfig.generator.agentName} (${contract.agentConfig.generator.agentId})`)
  }

  // Save initial contract
  saveContract(contract, sprintDir)

  // Load skills
  const mahRoot = process.cwd()
  const skillRoot = resolveSkillRoot(
    mahRoot,
    [config.agents.generator.cwd, config.project.repo].filter(
      (root): root is string => Boolean(root),
    ),
  )
  const allSkills = loadSkills(skillRoot)
  const namedAgents = loadNamedAgents()

  // Resolve skills for generator and evaluator
  const generatorSkillNames = contract.agentAssignments?.find(a => a.role === 'generator')?.skills
    ?? namedAgents.values().next().value?.defaultSkills
    ?? []
  const evaluatorSkillNames = contract.agentAssignments?.find(a => a.role === 'evaluator')?.skills
    ?? []

  const generatorSkills = resolveSkillsForPrompt(
    generatorSkillNames,
    allSkills,
    skillRoot,
    { missing: 'error' },
  )
  const evaluatorSkills = resolveSkillsForPrompt(
    evaluatorSkillNames,
    allSkills,
    skillRoot,
    { missing: 'error' },
  )

  if (generatorSkills.length > 0) {
    events.log('moe', 'milestone', 'contract', `Generator skills: ${generatorSkills.map(s => s.name).join(', ')}`)
  }
  if (evaluatorSkills.length > 0) {
    events.log('moe', 'milestone', 'contract', `Evaluator skills: ${evaluatorSkills.map(s => s.name).join(', ')}`)
  }

  if (options?.dryRun) {
    // Dry run: just print the contract and return stub metrics
    printContractSummary(contract, generatorSkills, evaluatorSkills)
    const metrics = createSprintMetrics(contract, config)
    return { contract, metrics }
  }

  const generatorAdapter = createAgentAdapter(config.agents.generator)
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

  // 3. Dev/QA loop — wrapped so terminal-state always reaches metrics + notification
  let crashError: Error | null = null
  try {
  const requestedExecutionTarget = config.agents.generator.cwd ?? contract.devBrief.repo
  const executionPreflightOptions = {
    ignoredStatePaths: [resolve(config.sprints.directory), resolve(config.metrics.output)],
  }
  const executionPreflight = inspectExecutionPreflight(
    requestedExecutionTarget,
    config.agents.generator,
    executionPreflightOptions,
  )
  const executionTarget = executionPreflight.repoRoot
  const executionGenerator = { ...config.agents.generator, cwd: executionTarget }
  const graders = resolveEnabledGraders(contract, config, executionTarget)
  contract.executionPreflight = executionPreflight
  contract.devBrief.repo = executionTarget
  contract.graders = graders
  if (config.findings?.findingsMode !== 'off' && !contract.scopeBaselineSha) {
    contract.scopeBaselineSha = executionPreflight.candidateSha
  }
  saveContract(contract, sprintDir)
  events.log('moe', 'milestone', 'preflight',
    `Target pinned: ${executionPreflight.repoRoot}@${executionPreflight.candidateSha}`)
  await preflightAdapter(generatorAdapter, executionGenerator)
  await preflightEnabledGraders(graders)
  events.log('moe', 'milestone', 'preflight',
    `Execution ready: ${config.agents.generator.type}/${config.agents.generator.model}; ${graders.length} grader(s) preflighted`)
  let expectedDevIdentity: DeliveryIdentity = executionPreflight
  for (let round = 1; round <= config.qa.maxIterations; round++) {
    console.log()
    console.log(chalk.bold.white(`  ─── Round ${round} / ${config.qa.maxIterations} ─────────────────────`))

    // 3a. Dev phase
    contract.status = 'dev'
    currentPhase = 'dev'
    currentRound = round
    writeHeartbeat(currentPhase, currentRound, sprintStartTime, contract.id, contract.name)

    assertDeliveryIdentity(
      executionTarget,
      expectedDevIdentity,
      executionPreflightOptions,
      `dev-r${round}-pre-execution`,
    )
    events.log('moe', 'spawn', 'dev', `Spawned dev agent R${round}`)

    const devPrompt = round === 1
      ? contractToDevPrompt(contract, generatorSkills)
      : contractToDevFixPrompt(contract, lastDevOutput, lastQAOutput, round)

    const sprintFullDir = join(sprintDir, contract.id)
    const devExecOptions = devExecuteOptions(config, {
      model: config.agents.generator.model,
      cwd: executionTarget,
      label: `dev-${contract.id}-r${round}`,
      rawActivityPath: join(sprintFullDir, 'raw', `dev-r${round}.log`),
    })
    const devResult = contract.agentConfig?.generator.agentId
      ? await generatorAdapter.executeWithAgent!(devPrompt, contract.agentConfig.generator.agentId, devExecOptions)
      : await generatorAdapter.execute(devPrompt, devExecOptions)

    // Capture dev transcript phase
    const devTranscriptPhase: TranscriptPhase = {
      phase: 'dev',
      round,
      actor: contract.agentConfig?.generator.agentName ?? 'dev',
      model: devResult.model ?? config.agents.generator.model,
      provider: devResult.provider,
      startTime: new Date(devResult.timing.startMs).toISOString(),
      endTime: new Date(devResult.timing.endMs).toISOString(),
      promptSent: devPrompt,
      responseReceived: boundTranscriptResponse(
        devResult.output,
        config.execution?.transcriptMaxChars,
      ),
      tokenUsage: devResult.tokenUsage,
      costEstimate: devResult.costEstimate,
    }
    transcript.phases.push(devTranscriptPhase)
    saveTranscript(transcript, sprintDir, contract.id)

    const devDuration = formatDuration(devResult.timing.durationMs)
    const devCost = devResult.costEstimate ? `$${devResult.costEstimate.toFixed(4)}` : ''
    events.log('dev', 'output', 'dev', `R${round} complete (${devDuration}${devCost ? ' / ' + devCost : ''})`)
    const recoverableCheckpoint = persistRecoverableCheckpoint({
      sprintPath: sprintFullDir,
      repoPath: executionTarget,
      ignoredStatePaths: [resolve(config.sprints.directory), resolve(config.metrics.output)],
      round,
      result: devResult,
    })
    if (recoverableCheckpoint) {
      events.log(
        'moe',
        'milestone',
        'checkpoint',
        `Preserved dirty Dev R${round} checkpoint; ordinary Dev retry blocked`,
      )
      throw recoverableCheckpointError(recoverableCheckpoint)
    }
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

    // 3b. Run all enabled graders
    contract.status = 'qa'
    currentPhase = 'qa'
    writeHeartbeat(currentPhase, currentRound, sprintStartTime, contract.id, contract.name)

    const graderResults: GraderResult[] = []
    // Use graders from contract if present; otherwise fall back to legacy UX-only
    const observedCandidateIdentity = inspectDeliveryPreflight(
      executionTarget,
      executionPreflightOptions,
    ).identity
    expectedDevIdentity = observedCandidateIdentity
    const candidateIdentity = config.qa.verdictMode === 'legacy'
      ? undefined
      : observedCandidateIdentity
    if (candidateIdentity) {
      contract.activeCandidateIdentity = candidateIdentity
      contract.activeCandidateRound = round
      saveContract(contract, sprintDir)
    }

    let qaResult: AgentResult | null = null

    for (const grader of graders) {
      let graderExecution: AgentResult | undefined
      if (grader.type !== 'ux' && grader.type !== 'code-review') {
        graderResults.push(failedGraderResult(
          grader,
          new Error(`Grader type "${grader.type}" has no execution adapter`),
        ))
        continue
      }
      try {
        const graderAdapter = createAgentAdapter(grader.agent)
        if (grader.type === 'ux') {
        // ── Quinn (UX) grader ──
        events.log('moe', 'spawn', 'qa', `Spawned ${grader.name} for QA R${round}`)
        const qaPrompt = contractToQAPrompt(contract, devResult.output, round, evaluatorSkills)
        const tierBudget = budgetForContract(contract)
        events.log('moe', 'milestone', 'qa',
          `Quinn tier=${contract.qaBrief.tier} budget=${Math.round(tierBudget.timeoutMs / 1000)}s scenarios≤${tierBudget.maxScenarios}`)
        const qaExecOptions = {
          model: grader.agent.model,
          cwd: grader.agent.workspace ?? executionTarget,
          timeoutMs: tierBudget.timeoutMs,
          label: `qa-${contract.id}-r${round}`,
          rawActivityPath: join(sprintFullDir, 'raw', `qa-r${round}-${grader.id}.log`),
          transcriptMaxChars: config.execution?.transcriptMaxChars,
        }
        const evaluatorAgentId = contract.agentConfig?.evaluator.agentId
        qaResult = evaluatorAgentId
          ? await graderAdapter.executeWithAgent!(qaPrompt, evaluatorAgentId, qaExecOptions)
          : await graderAdapter.execute(qaPrompt, qaExecOptions)
        graderExecution = qaResult

        const qaTranscriptPhase: TranscriptPhase = {
          phase: 'qa',
          round,
          actor: contract.agentConfig?.evaluator.agentName ?? 'quinn',
          model: qaResult.model ?? grader.agent.model,
          provider: qaResult.provider,
          startTime: new Date(qaResult.timing.startMs).toISOString(),
          endTime: new Date(qaResult.timing.endMs).toISOString(),
          promptSent: qaPrompt,
          responseReceived: boundTranscriptResponse(
            qaResult.output,
            config.execution?.transcriptMaxChars,
          ),
          tokenUsage: qaResult.tokenUsage,
          costEstimate: qaResult.costEstimate,
        }
        transcript.phases.push(qaTranscriptPhase)
        saveTranscript(transcript, sprintDir, contract.id)
        if (!qaResult.success) throw new Error(qaResult.output || `${grader.name} failed`)

        const qaDuration = formatDuration(qaResult.timing.durationMs)
        const qaCost = qaResult.costEstimate ? `$${qaResult.costEstimate.toFixed(4)}` : ''
        events.log('quinn', 'output', 'qa', `R${round} verdict received (${qaDuration}${qaCost ? ' / ' + qaCost : ''})`)

        // Convert QA report to GraderResult format
        const qaReport = parseQAReport(qaResult.output)
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
          findings: qaReport.defects.map((d) => ({
            id: d.id,
            severity: severityMap(d.severity),
            findingKind: 'defect',
            category: d.category ?? 'ux',
            description: d.description,
            scopeRelationship: d.scopeRelationship,
            releaseImpact: d.releaseImpact,
            evidenceConfidence: d.evidenceConfidence,
            investigationQuestion: d.investigationQuestion,
            exitCriterion: d.exitCriterion,
          })),
          summary: qaReport.summary,
          model: qaResult.model ?? grader.agent.model,
          provider: qaResult.provider,
          durationMs: qaResult.timing.durationMs,
          costEstimate: qaResult.costEstimate ?? 0,
          executionStatus: hasExplicitQAVerdict(qaResult.output) ? 'completed' : 'missing',
          processExit: 'completed',
          finalArtifactAvailable: Boolean(qaResult.output.trim()),
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
        const crResult = await graderAdapter.execute(crPrompt, {
          model: grader.agent.model,
          cwd: executionTarget,
          timeoutMs: 5 * 60 * 1000,
          label: `cr-${contract.id}-r${round}`,
          rawActivityPath: join(sprintFullDir, 'raw', `code-review-r${round}-${grader.id}.log`),
          transcriptMaxChars: config.execution?.transcriptMaxChars,
        })
        graderExecution = crResult

        const crTranscriptPhase: TranscriptPhase = {
          phase: 'qa',
          round,
          actor: 'code-reviewer',
          model: crResult.model ?? grader.agent.model,
          provider: crResult.provider,
          startTime: new Date(crResult.timing.startMs).toISOString(),
          endTime: new Date(crResult.timing.endMs).toISOString(),
          promptSent: crPrompt,
          responseReceived: boundTranscriptResponse(
            crResult.output,
            config.execution?.transcriptMaxChars,
          ),
          tokenUsage: crResult.tokenUsage,
          costEstimate: crResult.costEstimate,
        }
        transcript.phases.push(crTranscriptPhase)
        saveTranscript(transcript, sprintDir, contract.id)
        if (!crResult.success) throw new Error(crResult.output || `${grader.name} failed`)

        const crDuration = formatDuration(crResult.timing.durationMs)
        const crCost = crResult.costEstimate ? `$${crResult.costEstimate.toFixed(4)}` : ''
        events.log('system', 'output', 'qa', `Code review R${round} complete (${crDuration}${crCost ? ' / ' + crCost : ''})`)

        const crGraderResult = parseCodeReviewResult(
          crResult.output,
          grader.id,
          grader.name,
          crResult.model ?? grader.agent.model,
          crResult.timing.durationMs,
          crResult.costEstimate ?? 0
        )
        crGraderResult.provider = crResult.provider
        crGraderResult.processExit = 'completed'
        crGraderResult.finalArtifactAvailable = Boolean(crResult.output.trim())
        graderResults.push(crGraderResult)
        }
      } catch (error) {
        if (grader.type === 'ux') qaResult = null
        graderResults.push(failedGraderResult(grader, error, graderExecution))
        events.log('moe', 'error', 'qa',
          `${grader.name} failed closed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // 3c. Aggregate verdict across all graders
    const evaluationProvenance = candidateIdentity
      ? buildDeliveryEvaluationProvenance(contract, config, candidateIdentity.candidateSha, graderResults)
      : undefined
    const delivery = evaluateDeliveryVerdict(
      graders,
      graderResults,
      config.qa.verdictMode,
      evaluationProvenance,
    )
    if (candidateIdentity) {
      const failure = verifyDeliveryIdentity(
        executionTarget,
        candidateIdentity,
        { ignoredStatePaths: [resolve(config.sprints.directory), resolve(config.metrics.output)] },
        `qa-r${round}-final-preflight`,
      )
      if (failure) delivery.failures.push(failure)
    }
    let aggregateVerdict = delivery.failures.length > 0 ? 'fail' : delivery.verdict

    // Extract QA defects from UX grader result (for backward compat)
    const uxResult = graderResults.find(r => r.graderType === 'ux')
    const findingsConfig = {
      ...(config.findings ?? {
      scopeGate: 'advisory' as const,
      findingsMode: 'report' as const,
      ticketDispatchEnabled: false,
      currentPrPaths: [],
      }),
      currentPrPaths: [...(config.findings?.currentPrPaths ?? [])],
    }
    const findingsRound = candidateIdentity
      ? await processScopeAwareFindingRound({
        repoPath: executionTarget,
        baselineSha: contract.scopeBaselineSha,
        candidateSha: candidateIdentity.candidateSha,
        graderResults: delivery.productResults,
        failures: delivery.failures,
        originalVerdict: aggregateVerdict,
        config: findingsConfig,
        scopeStage: `findings-scope-r${round}`,
        reportPath: join(sprintDir, contract.id, `findings-r${round}.json`),
      })
      : undefined
    const findingsReport = findingsRound?.report
    if (findingsRound) aggregateVerdict = findingsRound.verdict
    const qaDefects = materialGraderFindings(
      repairScopedGraderResults(delivery.productResults, findingsReport),
    ).map(f => ({
      id: f.id,
      severity: reverseSeverityMap(f.severity),
      category: f.category,
      description: f.description,
      fixed: false,
      scopeRelationship: f.scopeRelationship,
      releaseImpact: f.releaseImpact,
      evidenceConfidence: f.evidenceConfidence,
      investigationQuestion: f.investigationQuestion,
      exitCriterion: f.exitCriterion,
    }))

    // 3d. Record iteration (backward compatible)
    const iteration: SprintIteration = {
      round,
      dev: agentResultToPhaseResult(devResult, config.agents.generator.model),
      qa: qaResult ? agentResultToPhaseResult(qaResult, uxResult?.model ?? config.agents.evaluator.model) : undefined,
      defects: qaDefects,
      graderResults,
      deliveryFailures: delivery.failures,
      evaluationProvenance,
      harnessDiagnostics: delivery.harnessDiagnostics,
      candidateIdentity,
      findingsReport,
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
    lastQAOutput = buildConsolidatedRepairBrief(
      repairScopedGraderResults(graderResults, findingsReport),
      delivery.failures,
      {
        includeInformational:
          findingsReport?.scopeGate === 'enforced' && findingsReport.reviewComplete,
      },
    )
  }
  } catch (err) {
    crashError = err as Error
    contract.status = 'failed'
    contract.deliveryFailures = [classifyDeliveryError(err, `${currentPhase}-r${currentRound}`)]
    events.log('moe', 'error', 'metrics',
      `Orchestrator crashed during ${currentPhase} R${currentRound}: ${crashError.message}`)
    try { saveContract(contract, sprintDir) } catch { /* best effort */ }
  }

  // 4. Extract artifacts from last dev output
  if (contract.status === 'passed' && lastDevOutput) {
    const artifacts = extractArtifacts(lastDevOutput, contract.id)
    if (artifacts.length > 0) {
      contract.outputs = artifacts
      const sprintFullDir = join(sprintDir, contract.id)
      saveArtifacts(artifacts, sprintFullDir)
      events.log('system', 'milestone', 'metrics', `Extracted ${artifacts.length} artifact(s)`)
    }
  }

  // 5. Compute metrics
  contract.completedAt = new Date().toISOString()
  const metrics = createSprintMetrics(contract, config)

  // 6. Save everything
  saveContract(contract, sprintDir)
  saveMetrics(metrics, join(sprintDir, contract.id))

  // Also save metrics to the configured metrics directory
  saveMetrics(metrics, metricsDir)

  // 6. Write notification + clear heartbeat
  clearInterval(heartbeatInterval)
  clearHeartbeat()
  writeNotification(contract, metrics, crashError)

  return crashError ? { contract, metrics, crashError } : { contract, metrics }
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
  options: { qaOnly?: QAOnlyResumeRequest } = {},
): Promise<RunSprintResult> {
  config.qa.verdictMode = resolveVerdictMode(config.qa.verdictMode)
  const metricsDir = resolve(process.cwd(), config.metrics.output)
  const sprintStartTime = Date.now()

  events.log('moe', 'milestone', 'contract', `Starting sprint: ${contract.name}`)
  events.log('moe', 'milestone', 'contract', `Sprint ID: ${contract.id}`)

  // Load skills
  const mahRoot2 = process.cwd()
  const skillRoot2 = resolveSkillRoot(
    mahRoot2,
    [config.agents.generator.cwd, config.project.repo].filter(
      (root): root is string => Boolean(root),
    ),
  )
  const allSkills2 = loadSkills(skillRoot2)
  const namedAgents2 = loadNamedAgents()

  const genSkillNames2 = contract.agentAssignments?.find(a => a.role === 'generator')?.skills ?? []
  const evalSkillNames2 = contract.agentAssignments?.find(a => a.role === 'evaluator')?.skills ?? []
  const genSkills2 = resolveSkillsForPrompt(
    genSkillNames2,
    allSkills2,
    skillRoot2,
    { missing: 'error' },
  )
  const evalSkills2 = resolveSkillsForPrompt(
    evalSkillNames2,
    allSkills2,
    skillRoot2,
    { missing: 'error' },
  )

  if (genSkills2.length > 0) {
    events.log('moe', 'milestone', 'contract', `Generator skills: ${genSkills2.map(s => s.name).join(', ')}`)
  }
  if (evalSkills2.length > 0) {
    events.log('moe', 'milestone', 'contract', `Evaluator skills: ${evalSkills2.map(s => s.name).join(', ')}`)
  }

  const generatorAdapter = createAgentAdapter(config.agents.generator)
  let lastDevOutput = ''
  let lastQAOutput = ''
  let currentPhase = 'dev'
  let currentRound = 0

  // Load previous transcript if exists (for re-runs of failed sprints)
  const existingTranscriptPath = resolve(sprintFullPath, 'transcript.json')
  let previousTranscript: SprintTranscript | null = null
  let resumeFromRound = 1
  let resumeFromPhase: 'dev' | 'qa' = 'dev'

  try {
    if (options.qaOnly && !existsSync(existingTranscriptPath)) {
      throw new Error(
        `${RECOVERABLE_CHECKPOINT_CODE}: QA-only resume requires a persisted transcript.`,
      )
    }
    if (existsSync(existingTranscriptPath)) {
      previousTranscript = JSON.parse(readFileSync(existingTranscriptPath, 'utf-8'))
      if (
        options.qaOnly
        && (!previousTranscript || previousTranscript.phases.length === 0)
      ) {
        throw new Error(
          `${RECOVERABLE_CHECKPOINT_CODE}: QA-only resume requires a non-empty persisted transcript.`,
        )
      }
      if (previousTranscript && previousTranscript.phases.length > 0) {
        const checkpoint = loadRecoverableCheckpoint(sprintFullPath)
        if (options.qaOnly) {
          const devPhase = previousTranscript.phases.find(
            (phase) => phase.phase === 'dev' && phase.round === options.qaOnly!.round,
          )
          if (!devPhase) {
            throw new Error(
              `MAH_RECOVERABLE_CHECKPOINT: no persisted Dev R${options.qaOnly.round} phase exists.`,
            )
          }
          const candidateIdentity = verifyQAOnlyResume({
            sprintPath: sprintFullPath,
            repoPath: config.agents.generator.cwd ?? contract.devBrief.repo,
            request: options.qaOnly,
            ignoredStatePaths: [resolve(config.sprints.directory), resolve(config.metrics.output)],
          })
          contract.activeCandidateIdentity = candidateIdentity
          contract.activeCandidateRound = options.qaOnly.round
          saveContractDirect(contract, sprintFullPath)
          resumeFromRound = options.qaOnly.round
          resumeFromPhase = 'qa'
          lastDevOutput = devPhase.responseReceived
          events.log(
            'moe',
            'milestone',
            'resume',
            `QA-only resume pinned to ${candidateIdentity.candidateSha} for R${resumeFromRound}`,
          )
        } else if (checkpoint?.status === 'dirty') {
          throw recoverableCheckpointError(checkpoint)
        } else {
        // Find the last completed phase to determine resume point
        const lastPhase = previousTranscript.phases[previousTranscript.phases.length - 1]
        if (lastPhase.phase === 'dev') {
          // Dev completed, QA crashed — resume from QA of same round
          resumeFromRound = lastPhase.round
          lastDevOutput = lastPhase.responseReceived
          if (canResumeQAWithPinnedCandidate(
            contract.activeCandidateIdentity,
            contract.activeCandidateRound,
            resumeFromRound,
            config.qa.verdictMode,
          )) {
            resumeFromPhase = 'qa'
            events.log('moe', 'milestone', 'resume', `Resuming from round ${resumeFromRound} QA phase (dev output carried forward)`)
          } else {
            resumeFromPhase = 'dev'
            events.log('moe', 'milestone', 'resume', `Rerunning dev R${resumeFromRound}: no same-round candidate identity was pinned before the crash`)
          }
        } else if (lastPhase.phase === 'qa') {
          const lastIteration = contract.iterations.find((iteration) => iteration.round === lastPhase.round)
          const devPhase = previousTranscript.phases.find(p => p.phase === 'dev' && p.round === lastPhase.round)
          if (devPhase) lastDevOutput = devPhase.responseReceived
          const configuredGraders = contract.graders ?? [
            { id: 'ux-quinn', enabled: true },
          ]
          if (hasCompleteRequiredGraderResults(
            configuredGraders,
            lastIteration?.graderResults,
            config.qa.verdictMode,
          )) {
            // All required graders were aggregated before the crash; advance to repair.
            resumeFromRound = lastPhase.round + 1
            resumeFromPhase = 'dev'
            const persistedRepairResults = lastIteration?.graderResults
              ? repairScopedGraderResults(
                lastIteration.graderResults,
                lastIteration.findingsReport,
              )
              : undefined
            lastQAOutput = restoreRepairFeedback(
              lastPhase.responseReceived,
              persistedRepairResults,
              lastIteration?.deliveryFailures,
              {
                includeInformational:
                  lastIteration?.findingsReport?.scopeGate === 'enforced'
                  && lastIteration.findingsReport.reviewComplete,
              },
            )
            events.log('moe', 'milestone', 'resume', `Resuming from round ${resumeFromRound} dev phase (previous QA findings carried forward)`)
          } else {
            // A grader transcript exists, but aggregation was not persisted; rerun the round.
            resumeFromRound = lastPhase.round
            resumeFromPhase = canResumeQAWithPinnedCandidate(
              contract.activeCandidateIdentity,
              contract.activeCandidateRound,
              resumeFromRound,
              config.qa.verdictMode,
            ) ? 'qa' : 'dev'
            events.log('moe', 'milestone', 'resume', `Rerunning ${resumeFromPhase} R${resumeFromRound}: required grader aggregation was incomplete`)
          }
        }
        }
      }
    }
  } catch (error) {
    if (
      error instanceof Error
      && error.message.includes('MAH_RECOVERABLE_CHECKPOINT')
    ) {
      throw error
    }
    previousTranscript = null
    resumeFromRound = 1
    resumeFromPhase = 'dev'
  }

  const transcript: SprintTranscript = {
    sprintId: contract.id,
    phases: previousTranscript?.phases ?? [],
  }

  // Restore iterations from previous run
  if (contract.iterations.length === 0 && previousTranscript?.phases) {
    // Rebuild iterations from transcript phases for rounds before resume point
    // This ensures metrics account for previous work
  }

  contract.status = 'dev'
  saveContractDirect(contract, sprintFullPath)

  writeHeartbeat(currentPhase, currentRound, sprintStartTime, contract.id, contract.name)
  const heartbeatInterval = setInterval(() => {
    writeHeartbeat(currentPhase, currentRound, sprintStartTime, contract.id, contract.name)
  }, 30_000)

  // Dev/QA loop — wrapped so terminal-state always reaches metrics + notification
  let crashError: Error | null = null
  try {
  const requestedExecutionTarget = config.agents.generator.cwd ?? contract.devBrief.repo
  const executionPreflightOptions = {
    ignoredStatePaths: [resolve(config.sprints.directory), resolve(config.metrics.output)],
  }
  const executionPreflight = inspectExecutionPreflight(
    requestedExecutionTarget,
    config.agents.generator,
    executionPreflightOptions,
  )
  const executionTarget = executionPreflight.repoRoot
  const executionGenerator = { ...config.agents.generator, cwd: executionTarget }
  const graders = resolveEnabledGraders(contract, config, executionTarget)
  contract.executionPreflight = executionPreflight
  contract.devBrief.repo = executionTarget
  contract.graders = graders
  if (
    config.findings?.findingsMode !== 'off'
    && !contract.scopeBaselineSha
    && !previousTranscript?.phases.some((phase) => phase.phase === 'dev')
    && contract.iterations.length === 0
  ) {
    contract.scopeBaselineSha = executionPreflight.candidateSha
  }
  saveContractDirect(contract, sprintFullPath)
  events.log('moe', 'milestone', 'preflight',
    `Target pinned: ${executionPreflight.repoRoot}@${executionPreflight.candidateSha}`)
  await preflightAdapter(generatorAdapter, executionGenerator)
  await preflightEnabledGraders(graders)
  events.log('moe', 'milestone', 'preflight',
    `Execution ready: ${config.agents.generator.type}/${config.agents.generator.model}; ${graders.length} grader(s) preflighted`)
  let expectedDevIdentity: DeliveryIdentity = executionPreflight
  for (let round = 1; round <= config.qa.maxIterations; round++) {
    // Skip rounds that completed in previous run
    if (round < resumeFromRound) {
      events.log('moe', 'milestone', 'skip', `Skipping round ${round} (completed in previous run)`)
      continue
    }
    console.log()
    console.log(chalk.bold.white(`  ─── Round ${round} / ${config.qa.maxIterations} ─────────────────────`))

    // Dev phase — skip if resuming from QA on this round
    const skipDev = (round === resumeFromRound && resumeFromPhase === 'qa')
    let devResult: AgentResult

    if (skipDev) {
      events.log('moe', 'milestone', 'resume', `Skipping dev R${round} (already completed, resuming from QA)`)
      // Build a synthetic devResult from the previous transcript
      const prevDevPhase = previousTranscript?.phases.find(p => p.phase === 'dev' && p.round === round)
      devResult = {
        success: true,
        output: prevDevPhase?.responseReceived ?? lastDevOutput,
        timing: {
          startMs: prevDevPhase ? new Date(prevDevPhase.startTime).getTime() : Date.now(),
          endMs: prevDevPhase ? new Date(prevDevPhase.endTime).getTime() : Date.now(),
          durationMs: 0,
        },
        tokenUsage: prevDevPhase?.tokenUsage,
        costEstimate: prevDevPhase?.costEstimate ?? 0,
      }
    } else {
      currentPhase = 'dev-preflight'
      currentRound = round
      assertDeliveryIdentity(
        executionTarget,
        expectedDevIdentity,
        executionPreflightOptions,
        `dev-r${round}-pre-execution`,
      )
      contract.status = 'dev'
      currentPhase = 'dev'
      currentRound = round
      writeHeartbeat(currentPhase, currentRound, sprintStartTime, contract.id, contract.name)

      // If resuming and we have prior context, enhance the prompt
      let devPromptContext = ''
      if (previousTranscript && round === resumeFromRound && resumeFromRound > 1) {
        const priorQA = previousTranscript.phases.filter(p => p.phase === 'qa').map(p =>
          `[Round ${p.round} QA]: ${p.responseReceived.slice(0, 500)}`
        ).join('\n')
        if (priorQA) {
          devPromptContext = `\n\n## Previous Attempt Context\nThis sprint was attempted before but the executor crashed. Here's what QA found in previous rounds:\n${priorQA}\n\nPlease address these findings in your implementation.\n`
        }
      }

      events.log('moe', 'spawn', 'dev', `Spawned dev agent R${round}`)

      const baseDevPrompt = round === 1
        ? contractToDevPrompt(contract, genSkills2)
        : contractToDevFixPrompt(contract, lastDevOutput, lastQAOutput, round)
      const devPrompt = baseDevPrompt + devPromptContext

      const devExecOptions2 = devExecuteOptions(config, {
        model: config.agents.generator.model,
        cwd: executionTarget,
        label: `dev-${contract.id}-r${round}`,
        rawActivityPath: join(sprintFullPath, 'raw', `dev-r${round}.log`),
      })
      devResult = contract.agentConfig?.generator.agentId
        ? await generatorAdapter.executeWithAgent!(devPrompt, contract.agentConfig.generator.agentId, devExecOptions2)
        : await generatorAdapter.execute(devPrompt, devExecOptions2)
    }

    if (!skipDev) {
      const devTranscriptPhase: TranscriptPhase = {
        phase: 'dev',
        round,
        actor: contract.agentConfig?.generator.agentName ?? 'dev',
        model: devResult.model ?? config.agents.generator.model,
        provider: devResult.provider,
        startTime: new Date(devResult.timing.startMs).toISOString(),
        endTime: new Date(devResult.timing.endMs).toISOString(),
        promptSent: '(see contract)',
        responseReceived: boundTranscriptResponse(
          devResult.output,
          config.execution?.transcriptMaxChars,
        ),
        tokenUsage: devResult.tokenUsage,
        costEstimate: devResult.costEstimate,
      }
      transcript.phases.push(devTranscriptPhase)
      saveTranscriptDirect(transcript, sprintFullPath)

      const devDuration = formatDuration(devResult.timing.durationMs)
      const devCost = devResult.costEstimate ? `$${devResult.costEstimate.toFixed(4)}` : ''
      events.log('dev', 'output', 'dev', `R${round} complete (${devDuration}${devCost ? ' / ' + devCost : ''})`)
      const recoverableCheckpoint = persistRecoverableCheckpoint({
        sprintPath: sprintFullPath,
        repoPath: executionTarget,
        ignoredStatePaths: [resolve(config.sprints.directory), resolve(config.metrics.output)],
        round,
        result: devResult,
      })
      if (recoverableCheckpoint) {
        events.log(
          'moe',
          'milestone',
          'checkpoint',
          `Preserved dirty Dev R${round} checkpoint; ordinary Dev retry blocked`,
        )
        throw recoverableCheckpointError(recoverableCheckpoint)
      }
      if (!devResult.success) throw new Error(`Dev agent failed before QA: ${devResult.output.slice(0, 500)}`)
    }

    // Dev-driven QA escalation: if dev flagged risk, bump the QA tier before Quinn runs.
    if (!skipDev) {
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
    }

    // QA phase — run all enabled graders
    contract.status = 'qa'
    currentPhase = 'qa'
    writeHeartbeat(currentPhase, currentRound, sprintStartTime, contract.id, contract.name)

    const graderResults: GraderResult[] = []
    const observedCandidateIdentity = inspectDeliveryPreflight(
      executionTarget,
      executionPreflightOptions,
    ).identity
    expectedDevIdentity = observedCandidateIdentity
    const candidateIdentity = config.qa.verdictMode === 'legacy'
      ? undefined
      : observedCandidateIdentity
    if (candidateIdentity) {
      if (
        skipDev &&
        contract.activeCandidateIdentity &&
        contract.activeCandidateRound === round
      ) {
        const resumedMismatch = identityMismatch(
          contract.activeCandidateIdentity,
          candidateIdentity,
        )
        if (resumedMismatch) throw new Error(resumedMismatch.message)
      }
      contract.activeCandidateIdentity = candidateIdentity
      contract.activeCandidateRound = round
      saveContractDirect(contract, sprintFullPath)
    }

    let qaResult: AgentResult | null = null

    for (const grader of graders) {
      let graderExecution: AgentResult | undefined
      if (grader.type !== 'ux' && grader.type !== 'code-review') {
        graderResults.push(failedGraderResult(
          grader,
          new Error(`Grader type "${grader.type}" has no execution adapter`),
        ))
        continue
      }
      try {
        const graderAdapter = createAgentAdapter(grader.agent)
        if (grader.type === 'ux') {
        events.log('moe', 'spawn', 'qa', `Spawned ${grader.name} for QA R${round}`)
        const qaPrompt = contractToQAPrompt(contract, devResult.output, round, evalSkills2)
        const tierBudget2 = budgetForContract(contract)
        events.log('moe', 'milestone', 'qa',
          `Quinn tier=${contract.qaBrief.tier} budget=${Math.round(tierBudget2.timeoutMs / 1000)}s scenarios≤${tierBudget2.maxScenarios}`)
        const qaExecOptions2 = {
          model: grader.agent.model,
          cwd: grader.agent.workspace ?? executionTarget,
          timeoutMs: tierBudget2.timeoutMs,
          label: `qa-${contract.id}-r${round}`,
          rawActivityPath: join(sprintFullPath, 'raw', `qa-r${round}-${grader.id}.log`),
          transcriptMaxChars: config.execution?.transcriptMaxChars,
        }
        const evaluatorAgentId2 = contract.agentConfig?.evaluator.agentId
        qaResult = evaluatorAgentId2
          ? await graderAdapter.executeWithAgent!(qaPrompt, evaluatorAgentId2, qaExecOptions2)
          : await graderAdapter.execute(qaPrompt, qaExecOptions2)
        graderExecution = qaResult

        const qaTranscriptPhase: TranscriptPhase = {
          phase: 'qa',
          round,
          actor: contract.agentConfig?.evaluator.agentName ?? 'quinn',
          model: qaResult.model ?? grader.agent.model,
          provider: qaResult.provider,
          startTime: new Date(qaResult.timing.startMs).toISOString(),
          endTime: new Date(qaResult.timing.endMs).toISOString(),
          promptSent: qaPrompt,
          responseReceived: boundTranscriptResponse(
            qaResult.output,
            config.execution?.transcriptMaxChars,
          ),
          tokenUsage: qaResult.tokenUsage,
          costEstimate: qaResult.costEstimate,
        }
        transcript.phases.push(qaTranscriptPhase)
        saveTranscriptDirect(transcript, sprintFullPath)
        if (!qaResult.success) throw new Error(qaResult.output || `${grader.name} failed`)

        const qaDuration = formatDuration(qaResult.timing.durationMs)
        const qaCost = qaResult.costEstimate ? `$${qaResult.costEstimate.toFixed(4)}` : ''
        events.log('quinn', 'output', 'qa', `R${round} verdict received (${qaDuration}${qaCost ? ' / ' + qaCost : ''})`)

        const qaReport = parseQAReport(qaResult.output)
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
            findingKind: 'defect',
            category: d.category ?? 'ux',
            description: d.description,
            scopeRelationship: d.scopeRelationship,
            releaseImpact: d.releaseImpact,
            evidenceConfidence: d.evidenceConfidence,
            investigationQuestion: d.investigationQuestion,
            exitCriterion: d.exitCriterion,
          })),
          summary: qaReport.summary,
          model: qaResult.model ?? grader.agent.model,
          provider: qaResult.provider,
          durationMs: qaResult.timing.durationMs,
          costEstimate: qaResult.costEstimate ?? 0,
          executionStatus: hasExplicitQAVerdict(qaResult.output) ? 'completed' : 'missing',
          processExit: 'completed',
          finalArtifactAvailable: Boolean(qaResult.output.trim()),
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
        const crResult = await graderAdapter.execute(crPrompt, {
          model: grader.agent.model,
          cwd: executionTarget,
          timeoutMs: 5 * 60 * 1000,
          label: `cr-${contract.id}-r${round}`,
          rawActivityPath: join(sprintFullPath, 'raw', `code-review-r${round}-${grader.id}.log`),
          transcriptMaxChars: config.execution?.transcriptMaxChars,
        })
        graderExecution = crResult

        const crTranscriptPhase: TranscriptPhase = {
          phase: 'qa',
          round,
          actor: 'code-reviewer',
          model: crResult.model ?? grader.agent.model,
          provider: crResult.provider,
          startTime: new Date(crResult.timing.startMs).toISOString(),
          endTime: new Date(crResult.timing.endMs).toISOString(),
          promptSent: crPrompt,
          responseReceived: boundTranscriptResponse(
            crResult.output,
            config.execution?.transcriptMaxChars,
          ),
          tokenUsage: crResult.tokenUsage,
          costEstimate: crResult.costEstimate,
        }
        transcript.phases.push(crTranscriptPhase)
        saveTranscriptDirect(transcript, sprintFullPath)
        if (!crResult.success) throw new Error(crResult.output || `${grader.name} failed`)

        const crDuration = formatDuration(crResult.timing.durationMs)
        const crCost = crResult.costEstimate ? `$${crResult.costEstimate.toFixed(4)}` : ''
        events.log('system', 'output', 'qa', `Code review R${round} complete (${crDuration}${crCost ? ' / ' + crCost : ''})`)

        const crGraderResult = parseCodeReviewResult(
          crResult.output,
          grader.id,
          grader.name,
          crResult.model ?? grader.agent.model,
          crResult.timing.durationMs,
          crResult.costEstimate ?? 0
        )
        crGraderResult.provider = crResult.provider
        crGraderResult.processExit = 'completed'
        crGraderResult.finalArtifactAvailable = Boolean(crResult.output.trim())
        graderResults.push(crGraderResult)
        }
      } catch (error) {
        if (grader.type === 'ux') qaResult = null
        graderResults.push(failedGraderResult(grader, error, graderExecution))
        events.log('moe', 'error', 'qa',
          `${grader.name} failed closed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const evaluationProvenance = candidateIdentity
      ? buildDeliveryEvaluationProvenance(contract, config, candidateIdentity.candidateSha, graderResults)
      : undefined
    const delivery = evaluateDeliveryVerdict(
      graders,
      graderResults,
      config.qa.verdictMode,
      evaluationProvenance,
    )
    if (candidateIdentity) {
      const failure = verifyDeliveryIdentity(
        executionTarget,
        candidateIdentity,
        { ignoredStatePaths: [resolve(config.sprints.directory), resolve(config.metrics.output)] },
        `qa-r${round}-final-preflight`,
      )
      if (failure) delivery.failures.push(failure)
    }
    let aggregateVerdict = delivery.failures.length > 0 ? 'fail' : delivery.verdict

    const uxResult = graderResults.find(r => r.graderType === 'ux')
    const findingsConfig = {
      ...(config.findings ?? {
      scopeGate: 'advisory' as const,
      findingsMode: 'report' as const,
      ticketDispatchEnabled: false,
      currentPrPaths: [],
      }),
      currentPrPaths: [...(config.findings?.currentPrPaths ?? [])],
    }
    const findingsRound = candidateIdentity
      ? await processScopeAwareFindingRound({
        repoPath: executionTarget,
        baselineSha: contract.scopeBaselineSha,
        candidateSha: candidateIdentity.candidateSha,
        graderResults: delivery.productResults,
        failures: delivery.failures,
        originalVerdict: aggregateVerdict,
        config: findingsConfig,
        scopeStage: `findings-scope-r${round}`,
        reportPath: join(sprintFullPath, `findings-r${round}.json`),
      })
      : undefined
    const findingsReport = findingsRound?.report
    if (findingsRound) aggregateVerdict = findingsRound.verdict
    const qaDefects = materialGraderFindings(
      repairScopedGraderResults(delivery.productResults, findingsReport),
    ).map(f => ({
      id: f.id,
      severity: reverseSeverityMap(f.severity),
      category: f.category,
      description: f.description,
      fixed: false,
      scopeRelationship: f.scopeRelationship,
      releaseImpact: f.releaseImpact,
      evidenceConfidence: f.evidenceConfidence,
      investigationQuestion: f.investigationQuestion,
      exitCriterion: f.exitCriterion,
    }))

    const iteration: SprintIteration = {
      round,
      dev: agentResultToPhaseResult(devResult, config.agents.generator.model),
      qa: qaResult ? agentResultToPhaseResult(qaResult, uxResult?.model ?? config.agents.evaluator.model) : undefined,
      defects: qaDefects,
      graderResults,
      deliveryFailures: delivery.failures,
      evaluationProvenance,
      harnessDiagnostics: delivery.harnessDiagnostics,
      candidateIdentity,
      findingsReport,
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
    lastQAOutput = buildConsolidatedRepairBrief(
      repairScopedGraderResults(graderResults, findingsReport),
      delivery.failures,
      {
        includeInformational:
          findingsReport?.scopeGate === 'enforced' && findingsReport.reviewComplete,
      },
    )
  }
  } catch (err) {
    crashError = err as Error
    contract.status = 'failed'
    contract.deliveryFailures = [classifyDeliveryError(err, `${currentPhase}-r${currentRound}`)]
    events.log('moe', 'error', 'metrics',
      `Orchestrator crashed during ${currentPhase} R${currentRound}: ${crashError.message}`)
    try { saveContractDirect(contract, sprintFullPath) } catch { /* best effort */ }
  }

  // Compute and save metrics
  contract.completedAt = new Date().toISOString()
  const metrics = createSprintMetrics(contract, config)

  saveContractDirect(contract, sprintFullPath)
  saveMetrics(metrics, sprintFullPath)
  saveMetrics(metrics, metricsDir)

  clearInterval(heartbeatInterval)
  clearHeartbeat()
  writeNotification(contract, metrics, crashError)

  return crashError ? { contract, metrics, crashError } : { contract, metrics }
}

function printContractSummary(contract: SprintContract, generatorSkills?: ResolvedSkill[], evaluatorSkills?: ResolvedSkill[]): void {
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

  if ((generatorSkills && generatorSkills.length > 0) || (evaluatorSkills && evaluatorSkills.length > 0)) {
    console.log()
    console.log(chalk.bold('  Skills'))
    if (generatorSkills && generatorSkills.length > 0) {
      console.log(`    Generator: ${generatorSkills.map(s => `${s.name} (${s.type})`).join(', ')}`)
    }
    if (evaluatorSkills && evaluatorSkills.length > 0) {
      console.log(`    Evaluator: ${evaluatorSkills.map(s => `${s.name} (${s.type})`).join(', ')}`)
    }
  }
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
