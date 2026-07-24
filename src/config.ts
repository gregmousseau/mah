import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import yaml from 'js-yaml'
import { getAgentModel } from './lib/agentRegistry.js'
import type { ProjectConfig, VerdictMode } from './types.js'

const DEFAULTS: Partial<ProjectConfig> = {
  priorities: { speed: 1, quality: 2, cost: 3 },
  qa: { defaultTier: 'targeted', maxIterations: 3, verdictMode: 'fail-closed' },
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
  model: string
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
      model: (v.model as string) ?? 'gpt-5.6-sol',
      type: (v.type as string) ?? 'codex',
      cwd: v.cwd as string | undefined,
      workspace: v.workspace as string | undefined,
      testUrl: v.testUrl as string | undefined,
      defaultSkills: v.defaultSkills as string[] | undefined,
      agentId: v.agentId as string | undefined,
    })
  }

  return agents
}

export function loadConfig(configPath?: string): ProjectConfig {
  const path = configPath ?? findConfig()
  if (!path) {
    throw new Error('No mah.yaml found. Run `mah init` to create one.')
  }

  const raw = readFileSync(path, 'utf-8')
  const parsed = yaml.load(raw) as Record<string, unknown>

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid config file: ${path}`)
  }

  const config = applyDefaults(parsed)
  validate(config)
  return config
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
      generator: normalizeAgent(agents.generator),
      evaluator: normalizeAgent(agents.evaluator),
    },
    qa: {
      defaultTier: (qa.defaultTier as 'smoke' | 'targeted' | 'full') ?? DEFAULTS.qa!.defaultTier,
      maxIterations: (qa.maxIterations as number) ?? DEFAULTS.qa!.maxIterations,
      verdictMode: resolveVerdictMode(qa.verdictMode as ProjectConfig['qa']['verdictMode']),
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

function normalizeAgent(raw: unknown): ProjectConfig['agents']['generator'] {
  if (!raw || typeof raw !== 'object') {
    return { type: 'codex', model: 'gpt-5.6-sol' }
  }
  const agent = raw as Record<string, unknown>
  const agentId = agent.agentId as string | undefined
  const explicitModel = agent.model as string | undefined
  const type = (agent.type as string as ProjectConfig['agents']['generator']['type']) ?? 'codex'
  const registryModel = (
    type === 'openclaw' || type === 'claude-cli'
  ) && agentId
    ? getAgentModel(agentId)
    : undefined
  // Resolution order: explicit yaml model → registry default for agentId → provider default.
  const model = explicitModel
    ?? registryModel
    ?? (type === 'codex' ? 'gpt-5.6-sol' : 'sonnet')
  return {
    type,
    model,
    cwd: agent.cwd as string | undefined,
    workspace: agent.workspace as string | undefined,
    testUrl: agent.testUrl as string | undefined,
    agentId,
  }
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
  for (const role of ['generator', 'evaluator'] as const) {
    const agent = config.agents[role]
    if (!SUPPORTED_AGENT_TYPES.includes(agent.type)) {
      throw new Error(
        `Unsupported agent type "${agent.type}" for ${role}. Supported: ${SUPPORTED_AGENT_TYPES.join(', ')}`
      )
    }
  }

  // QA max iterations must be positive
  if (config.qa.maxIterations < 1) {
    throw new Error('qa.maxIterations must be at least 1')
  }
  if (!['fail-closed', 'legacy'].includes(config.qa.verdictMode ?? '')) {
    throw new Error('qa.verdictMode must be "fail-closed" or "legacy"')
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
