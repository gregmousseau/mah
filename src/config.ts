import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import yaml from 'js-yaml'
import type { ProjectConfig } from './types.js'

const DEFAULTS: Partial<ProjectConfig> = {
  priorities: { speed: 1, quality: 2, cost: 3 },
  qa: { defaultTier: 'targeted', maxIterations: 3 },
  human: {
    notificationChannel: '',
    responseTimeoutMinutes: 30,
    onTimeout: 'proceed',
    costThreshold: 40,
  },
  metrics: { output: '.mah/metrics/' },
  sprints: { directory: '.mah/sprints/' },
}

const SUPPORTED_AGENT_TYPES = ['openclaw', 'claude-cli', 'codex', 'custom']

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
    return { type: 'openclaw', model: 'sonnet' }
  }
  const agent = raw as Record<string, unknown>
  return {
    type: (agent.type as string as ProjectConfig['agents']['generator']['type']) ?? 'openclaw',
    model: (agent.model as string) ?? 'sonnet',
    cwd: agent.cwd as string | undefined,
    workspace: agent.workspace as string | undefined,
    testUrl: agent.testUrl as string | undefined,
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
}
