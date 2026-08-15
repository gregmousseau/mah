import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import yaml from 'js-yaml'
import type { ProjectConfig, ReasoningEffort, VerdictMode } from './types.js'

const DEFAULTS: Partial<ProjectConfig> = {
  priorities: { speed: 1, quality: 2, cost: 3 },
  qa: { defaultTier: 'targeted', maxIterations: 3, verdictMode: 'fail-closed' },
  review: { defaultRisk: 'adaptive', browserQa: 'user-visible', maxMaterialFindings: 3 },
  execution: {
    devIdleTimeoutMinutes: 12,
    devAbsoluteTimeoutMinutes: 45,
    transcriptMaxChars: 32_000,
  },
  findings: {
    scopeGate: 'advisory',
    findingsMode: 'report',
    ticketDispatchEnabled: false,
    currentPrPaths: [],
    falsePositiveIds: [],
  },
  human: {
    notificationChannel: '',
    responseTimeoutMinutes: 30,
    onTimeout: 'proceed',
    costThreshold: 40,
  },
  metrics: { output: '.mah/metrics/' },
  sprints: { directory: '.mah/sprints/' },
}

const SUPPORTED_AGENT_TYPES = ['openclaw', 'claude-cli', 'codex', 'kilo', 'custom']

export function resolveVerdictMode(
  configured: VerdictMode | undefined,
  override = process.env.MAH_VERDICT_MODE,
): VerdictMode {
  const mode = override ?? configured ?? 'fail-closed'
  if (mode !== 'fail-closed' && mode !== 'legacy') {
    throw new Error('qa.verdictMode must be "fail-closed" or "legacy"')
  }
  return mode
}

export interface NamedAgentConfig {
  role: 'generator' | 'evaluator' | 'researcher'
  specialty?: string
  model?: string
  reasoningEffort?: ReasoningEffort
  fastMode?: boolean
  readOnly?: boolean
  type?: string
  cwd?: string
  workspace?: string
  testUrl?: string
  defaultSkills?: string[]
  agentId?: string
}

export function loadNamedAgents(configPath?: string): Map<string, NamedAgentConfig> {
  const path = configPath ?? findConfig()
  if (!path) return new Map()

  const raw = readFileSync(path, 'utf-8')
  const parsed = yaml.load(raw) as Record<string, unknown>
  if (!parsed || typeof parsed !== 'object') return new Map()

  const agents = new Map<string, NamedAgentConfig>()
  const agentsRaw = parsed.agents as Record<string, unknown> | undefined
  if (!agentsRaw) return agents

  for (const [id, value] of Object.entries(agentsRaw)) {
    if (id === 'generator' || id === 'evaluator') continue // skip legacy flat format
    if (!value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    if (!v.role) continue // must have a role to be a named agent

    agents.set(id, {
      role: v.role as NamedAgentConfig['role'],
      specialty: v.specialty as string | undefined,
      model: optionalNonEmptyString(v.model, `agents.${id}.model`),
      reasoningEffort: optionalReasoningEffort(v.reasoningEffort, `agents.${id}.reasoningEffort`),
      fastMode: optionalBoolean(v.fastMode, `agents.${id}.fastMode`),
      readOnly: optionalBoolean(v.readOnly, `agents.${id}.readOnly`),
      type: optionalNonEmptyString(v.type, `agents.${id}.type`),
      cwd: v.cwd as string | undefined,
      workspace: v.workspace as string | undefined,
      testUrl: v.testUrl as string | undefined,
      defaultSkills: v.defaultSkills as string[] | undefined,
      agentId: v.agentId as string | undefined,
    })
  }

  return agents
}

export function loadConfig(
  configPath?: string,
  runtimeEnv: NodeJS.ProcessEnv = process.env,
): ProjectConfig {
  const path = configPath ?? findConfig()
  if (!path) {
    throw new Error('No mah.yaml found. Run `mah init` to create one.')
  }

  const raw = readFileSync(path, 'utf-8')
  const parsed = yaml.load(raw) as Record<string, unknown>

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid config file: ${path}`)
  }

  const config = applyRuntimeAgentOverrides(applyDefaults(parsed), runtimeEnv)
  validate(config)
  return config
}

export function applyRuntimeAgentOverrides(
  config: ProjectConfig,
  runtimeEnv: NodeJS.ProcessEnv = process.env,
): ProjectConfig {
  const generator = { ...config.agents.generator }
  const evaluator = { ...config.agents.evaluator }

  const generatorType = runtimeOverride(runtimeEnv, 'MAH_GENERATOR_TYPE')
  const generatorModel = runtimeOverride(runtimeEnv, 'MAH_GENERATOR_MODEL')
  const generatorCwd = runtimeOverride(runtimeEnv, 'MAH_GENERATOR_CWD')
  const evaluatorType = runtimeOverride(runtimeEnv, 'MAH_EVALUATOR_TYPE')
  const evaluatorModel = runtimeOverride(runtimeEnv, 'MAH_EVALUATOR_MODEL')
  const generatorReasoning = runtimeOverride(runtimeEnv, 'MAH_GENERATOR_REASONING_EFFORT')
  const evaluatorReasoning = runtimeOverride(runtimeEnv, 'MAH_EVALUATOR_REASONING_EFFORT')
  const generatorOverrides: NonNullable<NonNullable<ProjectConfig['runtime']>['agentOverrides']>['generator'] = {}
  const evaluatorOverrides: NonNullable<NonNullable<ProjectConfig['runtime']>['agentOverrides']>['evaluator'] = {}

  if (generatorType) {
    generator.type = generatorType as ProjectConfig['agents']['generator']['type']
    generatorOverrides.type = generator.type
  }
  if (generatorModel) {
    generator.model = generatorModel
    generatorOverrides.model = generatorModel
  }
  if (generatorCwd) {
    generator.cwd = generatorCwd
    generatorOverrides.cwd = generatorCwd
  }
  if (generatorReasoning) {
    generator.reasoningEffort = requireReasoningEffort(
      generatorReasoning,
      'MAH_GENERATOR_REASONING_EFFORT',
    )
    generatorOverrides.reasoningEffort = generator.reasoningEffort
  }
  if (evaluatorType) {
    evaluator.type = evaluatorType as ProjectConfig['agents']['evaluator']['type']
  }
  if (evaluatorModel) {
    evaluator.model = evaluatorModel
  }
  if (evaluatorReasoning) {
    evaluator.reasoningEffort = requireReasoningEffort(
      evaluatorReasoning,
      'MAH_EVALUATOR_REASONING_EFFORT',
    )
  }
  if (evaluatorType || evaluatorModel || evaluatorReasoning) {
    // A resumed contract may contain an older provider/model pair. Any runtime
    // evaluator selection pins the complete resolved pair over that stale data.
    evaluatorOverrides.type = evaluator.type
    evaluatorOverrides.model = evaluator.model
    if (evaluator.reasoningEffort) evaluatorOverrides.reasoningEffort = evaluator.reasoningEffort
  }

  const hasGeneratorOverrides = Object.keys(generatorOverrides).length > 0
  const hasEvaluatorOverrides = Object.keys(evaluatorOverrides).length > 0

  return {
    ...config,
    agents: { ...config.agents, generator, evaluator },
    ...(hasGeneratorOverrides || hasEvaluatorOverrides
      ? {
          runtime: {
            ...config.runtime,
            agentOverrides: {
              ...config.runtime?.agentOverrides,
              ...(hasGeneratorOverrides ? { generator: generatorOverrides } : {}),
              ...(hasEvaluatorOverrides ? { evaluator: evaluatorOverrides } : {}),
            },
          },
        }
      : {}),
  }
}

function findConfig(): string | null {
  const candidates = ['mah.yaml', 'mah.yml']
  for (const name of candidates) {
    const full = resolve(process.cwd(), name)
    if (existsSync(full)) return full
  }
  return null
}

function applyDefaults(raw: Record<string, unknown>): ProjectConfig {
  const project = (raw.project as { name?: string; repo?: string }) ?? {}
  const priorities = (raw.priorities as Record<string, number>) ?? {}
  const agents = (raw.agents as Record<string, unknown>) ?? {}
  const qa = (raw.qa as Record<string, unknown>) ?? {}
  const review = (raw.review as Record<string, unknown>) ?? {}
  const execution = (raw.execution as Record<string, unknown>) ?? {}
  const findings = (raw.findings as Record<string, unknown>) ?? {}
  const human = (raw.human as Record<string, unknown>) ?? {}
  const metrics = (raw.metrics as Record<string, unknown>) ?? {}
  const sprints = (raw.sprints as Record<string, unknown>) ?? {}

  return {
    project: {
      name: project.name ?? 'Unnamed Project',
      repo: project.repo ?? '.',
    },
    priorities: {
      speed: (priorities.speed as 1 | 2 | 3) ?? DEFAULTS.priorities!.speed,
      quality: (priorities.quality as 1 | 2 | 3) ?? DEFAULTS.priorities!.quality,
      cost: (priorities.cost as 1 | 2 | 3) ?? DEFAULTS.priorities!.cost,
    },
    agents: {
      generator: normalizeAgent(agents.generator, 'generator'),
      evaluator: normalizeAgent(agents.evaluator, 'evaluator'),
      ...(agents.strictEvaluator
        ? { strictEvaluator: normalizeAgent(agents.strictEvaluator, 'strictEvaluator') }
        : {}),
    },
    qa: {
      defaultTier: (qa.defaultTier as 'smoke' | 'targeted' | 'full') ?? DEFAULTS.qa!.defaultTier,
      maxIterations: (qa.maxIterations as number) ?? DEFAULTS.qa!.maxIterations,
      verdictMode: resolveVerdictMode(qa.verdictMode as ProjectConfig['qa']['verdictMode']),
    },
    review: {
      defaultRisk: (review.defaultRisk as NonNullable<ProjectConfig['review']>['defaultRisk'])
        ?? DEFAULTS.review!.defaultRisk,
      browserQa: (review.browserQa as NonNullable<ProjectConfig['review']>['browserQa'])
        ?? DEFAULTS.review!.browserQa,
      maxMaterialFindings: (review.maxMaterialFindings as number)
        ?? DEFAULTS.review!.maxMaterialFindings,
    },
    execution: {
      devIdleTimeoutMinutes: (execution.devIdleTimeoutMinutes as number)
        ?? DEFAULTS.execution!.devIdleTimeoutMinutes,
      devAbsoluteTimeoutMinutes: (execution.devAbsoluteTimeoutMinutes as number)
        ?? DEFAULTS.execution!.devAbsoluteTimeoutMinutes,
      transcriptMaxChars: (execution.transcriptMaxChars as number)
        ?? DEFAULTS.execution!.transcriptMaxChars,
    },
    findings: {
      scopeGate: (findings.scopeGate as NonNullable<ProjectConfig['findings']>['scopeGate'])
        ?? DEFAULTS.findings!.scopeGate,
      findingsMode: (findings.findingsMode as NonNullable<ProjectConfig['findings']>['findingsMode'])
        ?? DEFAULTS.findings!.findingsMode,
      ticketDispatchEnabled: (findings.ticketDispatchEnabled as boolean)
        ?? DEFAULTS.findings!.ticketDispatchEnabled,
      currentPrPaths: (findings.currentPrPaths as string[])
        ?? DEFAULTS.findings!.currentPrPaths,
      falsePositiveIds: (findings.falsePositiveIds as string[])
        ?? DEFAULTS.findings!.falsePositiveIds,
      ...(findings.ticketTeamId !== undefined
        ? { ticketTeamId: findings.ticketTeamId as string }
        : {}),
    },
    human: {
      notificationChannel: (human.notificationChannel as string) ?? DEFAULTS.human!.notificationChannel,
      responseTimeoutMinutes: (human.responseTimeoutMinutes as number) ?? DEFAULTS.human!.responseTimeoutMinutes,
      onTimeout: (human.onTimeout as 'proceed' | 'pause' | 'skip') ?? DEFAULTS.human!.onTimeout,
      costThreshold: (human.costThreshold as number) ?? DEFAULTS.human!.costThreshold,
    },
    metrics: {
      output: (metrics.output as string) ?? DEFAULTS.metrics!.output,
    },
    sprints: {
      directory: (sprints.directory as string) ?? DEFAULTS.sprints!.directory,
    },
  }
}

function normalizeAgent(
  raw: unknown,
  role: 'generator' | 'evaluator' | 'strictEvaluator',
): ProjectConfig['agents']['generator'] {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`agents.${role} must be configured explicitly`)
  }
  const agent = raw as Record<string, unknown>
  const agentId = agent.agentId as string | undefined
  const type = requireNonEmptyString(
    agent.type,
    `agents.${role}.type`,
  ) as ProjectConfig['agents']['generator']['type']
  const model = requireNonEmptyString(agent.model, `agents.${role}.model`)
  return {
    type,
    model,
    ...(agent.reasoningEffort !== undefined
      ? { reasoningEffort: optionalReasoningEffort(agent.reasoningEffort, `agents.${role}.reasoningEffort`) }
      : {}),
    ...(agent.fastMode !== undefined
      ? { fastMode: optionalBoolean(agent.fastMode, `agents.${role}.fastMode`) }
      : {}),
    ...(agent.readOnly !== undefined
      ? { readOnly: optionalBoolean(agent.readOnly, `agents.${role}.readOnly`) }
      : {}),
    cwd: agent.cwd as string | undefined,
    workspace: agent.workspace as string | undefined,
    testUrl: agent.testUrl as string | undefined,
    agentId,
  }
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${path} must be configured explicitly`)
  }
  return value.trim()
}

function optionalNonEmptyString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined
  return requireNonEmptyString(value, path)
}

function optionalBoolean(value: unknown, path: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`${path} must be boolean`)
  return value
}

function requireReasoningEffort(value: unknown, path: string): ReasoningEffort {
  const effort = requireNonEmptyString(value, path) as ReasoningEffort
  if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) {
    throw new Error(`${path} must be low, medium, high, xhigh, or max`)
  }
  return effort
}

function optionalReasoningEffort(value: unknown, path: string): ReasoningEffort | undefined {
  return value === undefined ? undefined : requireReasoningEffort(value, path)
}

function runtimeOverride(runtimeEnv: NodeJS.ProcessEnv, name: string): string | undefined {
  if (!(name in runtimeEnv)) return undefined
  return requireNonEmptyString(runtimeEnv[name], name)
}

function validate(config: ProjectConfig): void {
  // Priorities must be unique 1/2/3
  const vals = [config.priorities.speed, config.priorities.quality, config.priorities.cost]
  const sorted = [...vals].sort()
  if (sorted[0] !== 1 || sorted[1] !== 2 || sorted[2] !== 3) {
    throw new Error(
      `Priorities must be unique values 1, 2, 3. Got: speed=${vals[0]}, quality=${vals[1]}, cost=${vals[2]}`
    )
  }

  // Agent types must be supported
  for (const role of ['generator', 'evaluator', 'strictEvaluator'] as const) {
    const agent = config.agents[role]
    if (!agent) continue
    if (!SUPPORTED_AGENT_TYPES.includes(agent.type)) {
      throw new Error(
        `Unsupported agent type "${agent.type}" for ${role}. Supported: ${SUPPORTED_AGENT_TYPES.join(', ')}`
      )
    }
    if (!agent.model.trim()) {
      throw new Error(`agents.${role}.model must be configured explicitly`)
    }
  }

  // QA max iterations must be positive
  if (config.qa.maxIterations < 1) {
    throw new Error('qa.maxIterations must be at least 1')
  }
  if (!['fail-closed', 'legacy'].includes(config.qa.verdictMode ?? '')) {
    throw new Error('qa.verdictMode must be "fail-closed" or "legacy"')
  }
  if (!config.review) throw new Error('review configuration was not resolved')
  if (!['adaptive', 'routine', 'strict'].includes(config.review.defaultRisk)) {
    throw new Error('review.defaultRisk must be "adaptive", "routine", or "strict"')
  }
  if (!['user-visible', 'always', 'never'].includes(config.review.browserQa)) {
    throw new Error('review.browserQa must be "user-visible", "always", or "never"')
  }
  if (
    !Number.isInteger(config.review.maxMaterialFindings)
    || config.review.maxMaterialFindings < 1
    || config.review.maxMaterialFindings > 3
  ) {
    throw new Error('review.maxMaterialFindings must be an integer from 1 to 3')
  }
  const execution = config.execution
  if (!execution) throw new Error('execution configuration was not resolved')
  if (!Number.isFinite(execution.devIdleTimeoutMinutes) || execution.devIdleTimeoutMinutes <= 0) {
    throw new Error('execution.devIdleTimeoutMinutes must be a positive number')
  }
  if (
    !Number.isFinite(execution.devAbsoluteTimeoutMinutes)
    || execution.devAbsoluteTimeoutMinutes < execution.devIdleTimeoutMinutes
  ) {
    throw new Error(
      'execution.devAbsoluteTimeoutMinutes must be greater than or equal to the idle timeout',
    )
  }
  if (!Number.isInteger(execution.transcriptMaxChars) || execution.transcriptMaxChars < 1_000) {
    throw new Error('execution.transcriptMaxChars must be an integer of at least 1000')
  }
  if (!config.findings) throw new Error('findings configuration was not resolved')
  if (!['advisory', 'enforced'].includes(config.findings.scopeGate)) {
    throw new Error('findings.scopeGate must be "advisory" or "enforced"')
  }
  if (!['off', 'report', 'ticket'].includes(config.findings.findingsMode)) {
    throw new Error('findings.findingsMode must be "off", "report", or "ticket"')
  }
  if (typeof config.findings.ticketDispatchEnabled !== 'boolean') {
    throw new Error('findings.ticketDispatchEnabled must be boolean')
  }
  if (!Array.isArray(config.findings.currentPrPaths)) {
    throw new Error('findings.currentPrPaths must be an array')
  }
  for (const path of config.findings.currentPrPaths) {
    if (
      typeof path !== 'string'
      || path.trim() === ''
      || path.startsWith('/')
      || /^[A-Za-z]:[\\/]/.test(path)
      || path.replaceAll('\\', '/').split('/').includes('..')
    ) {
      throw new Error('findings.currentPrPaths entries must be non-empty repository-relative paths without traversal')
    }
  }
  if (!Array.isArray(config.findings.falsePositiveIds)) {
    throw new Error('findings.falsePositiveIds must be an array')
  }
  if (config.findings.falsePositiveIds.some((id) => typeof id !== 'string' || id.trim() === '')) {
    throw new Error('findings.falsePositiveIds entries must be non-empty strings')
  }
  if (
    config.findings.ticketTeamId !== undefined
    && (typeof config.findings.ticketTeamId !== 'string' || !config.findings.ticketTeamId.trim())
  ) {
    throw new Error('findings.ticketTeamId must be a non-empty string when configured')
  }
  if (
    config.findings.findingsMode === 'ticket'
    && config.findings.ticketDispatchEnabled
    && !config.findings.ticketTeamId
  ) {
    throw new Error('findings.ticketTeamId is required when ticket dispatch is enabled')
  }
}
