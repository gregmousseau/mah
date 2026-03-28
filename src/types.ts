// MAH - Multi-Agent Harness
// Core type definitions

// ─── Project Configuration (from mah.yaml) ───

export interface ProjectConfig {
  project: {
    name: string
    repo: string
  }
  priorities: {
    speed: 1 | 2 | 3
    quality: 1 | 2 | 3
    cost: 1 | 2 | 3
  }
  agents: {
    generator: AgentConfig
    evaluator: AgentConfig
  }
  qa: {
    defaultTier: 'smoke' | 'targeted' | 'full'
    maxIterations: number
  }
  human: {
    notificationChannel: string
    responseTimeoutMinutes: number
    onTimeout: 'proceed' | 'pause' | 'skip'
    costThreshold: number
  }
  metrics: {
    output: string
  }
  sprints: {
    directory: string
  }
}

export interface AgentConfig {
  type: 'openclaw' | 'claude-cli' | 'codex' | 'custom'
  model: string
  cwd?: string
  workspace?: string
  testUrl?: string
}

// ─── Sprint Contract ───

export interface SprintContract {
  id: string
  name: string
  task: string
  status: 'planned' | 'dev' | 'qa' | 'passed' | 'failed' | 'escalated'
  devBrief: {
    repo: string
    constraints: string[]
    definitionOfDone: string[]
  }
  qaBrief: {
    tier: 'smoke' | 'targeted' | 'full'
    testUrl: string
    testFocus: string[]
    passCriteria: string[]
    knownLimitations: string[]
  }
  iterations: SprintIteration[]
  createdAt: string
  completedAt?: string
}

export interface SprintIteration {
  round: number
  dev?: PhaseResult
  qa?: PhaseResult
  defects: Defect[]
}

export interface PhaseResult {
  output: string
  startTime: string
  endTime: string
  durationMs: number
  model: string
  tokenUsage?: { input: number; output: number }
  costEstimate?: number
}

export interface Defect {
  id: string           // e.g., "P1-01"
  severity: 'p0' | 'p1' | 'p2' | 'p3'
  description: string
  fixed: boolean
}

// ─── QA Report (parsed from evaluator output) ───

export interface QAReport {
  verdict: 'pass' | 'conditional' | 'fail'
  defects: Defect[]
  summary: string
  recommendation: string
}

// ─── Sprint Metrics ───

export interface SprintMetrics {
  sprintId: string
  projectName: string
  task: string
  startTime: string
  endTime: string
  phases: PhaseMetric[]
  totals: {
    durationMs: number
    estimatedCost: number
    iterations: number
    humanWaitMs: number
  }
  quality: {
    defectsFound: SeverityCounts
    defectsFixed: SeverityCounts
    defectsRemaining: SeverityCounts
  }
  verdict: 'pass' | 'conditional' | 'fail' | 'escalated'
  bottleneck: string
}

export interface PhaseMetric {
  phase: 'plan' | 'dev' | 'qa'
  round: number
  durationMs: number
  model: string
  costEstimate: number
}

export interface SeverityCounts {
  p0: number
  p1: number
  p2: number
  p3: number
}

// ─── Agent Adapter (platform-agnostic boundary) ───

export interface AgentAdapter {
  execute(task: string, options: ExecuteOptions): Promise<AgentResult>
}

export interface ExecuteOptions {
  model?: string
  cwd?: string
  workspace?: string
  label?: string
  timeoutMs?: number
}

export interface AgentResult {
  success: boolean
  output: string
  timing: {
    startMs: number
    endMs: number
    durationMs: number
  }
  tokenUsage?: { input: number; output: number }
  costEstimate?: number
}

// ─── Event Stream (for Remotion replay) ───

export interface BuildEvent {
  ts: string           // ISO timestamp
  local: string        // local time HH:MM:SS
  actor: 'moe' | 'dev' | 'quinn' | 'human' | 'system'
  type: 'spawn' | 'output' | 'decision' | 'screenshot' | 'milestone' | 'error'
  phase: 'setup' | 'contract' | 'dev' | 'qa' | 'metrics' | 'human'
  summary: string
  detail?: string
}
