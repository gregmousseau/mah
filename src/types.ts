// MAH - Multi-Agent Harness
// Core type definitions

// ─── Grader System ───

export interface Grader {
  id: string
  type: 'ux' | 'code-review' | 'accessibility' | 'performance' | 'custom'
  name: string
  agent: AgentConfig
  enabled: boolean
}

export interface GraderResult {
  graderId: string
  graderType: string
  graderName: string
  verdict: 'pass' | 'conditional' | 'fail'
  findings: GraderFinding[]
  summary: string
  model: string
  provider?: string
  durationMs: number
  costEstimate: number
  executionStatus?: 'completed' | 'missing' | 'failed' | 'timed_out'
}

export type VerdictMode = 'fail-closed' | 'legacy'

export interface DeliveryFailure {
  kind: 'product' | 'harness' | 'preflight' | 'identity'
  stage: string
  message: string
  graderId?: string
}

export interface DeliveryIdentity {
  candidateSha: string
  dependencyFingerprint: string | null
}

export interface GraderFinding {
  id: string
  severity: 'critical' | 'major' | 'minor' | 'info'
  category: string  // e.g., "security", "performance", "style", "bug-risk", "complexity"
  file?: string
  line?: number
  description: string
  suggestion?: string
  // Scope and release impact, rather than severity, decide whether a
  // product finding belongs in the active repair loop.
  scopeRelationship?: 'introduced' | 'worsened' | 'activated' | 'pre-existing' | 'unknown'
  releaseImpact?: 'required-for-release-safety' | 'not-release-blocking' | 'unknown'
  evidenceConfidence?: 'confirmed' | 'plausible' | 'insufficient'
  investigationQuestion?: string
  exitCriterion?: string
}

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
    verdictMode?: VerdictMode
  }
  findings?: {
    scopeGate: 'advisory' | 'enforced'
    findingsMode: 'off' | 'report' | 'ticket'
    ticketDispatchEnabled: boolean
    currentPrPaths: string[]
    falsePositiveIds?: string[]
    ticketTeamId?: string
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
  type: 'openclaw' | 'claude-cli' | 'codex' | 'kilo' | 'custom'
  model: string
  cwd?: string
  workspace?: string
  testUrl?: string
  // When set, the adapter loads SOUL.md from the agent's workspace and prepends
  // it to the task. Required for project-scoped agents (e.g. 'awc' → Aria).
  agentId?: string
}

// ─── Project ───

export interface Project {
  id: string
  name: string
  description?: string
  repo?: string
  createdAt: string
  config?: {
    priorities?: { speed: 1 | 2 | 3; quality: 1 | 2 | 3; cost: 1 | 2 | 3 }
    defaultAgents?: { generator: AgentConfig; evaluator: AgentConfig }
    qa?: { defaultTier: 'smoke' | 'targeted' | 'full'; maxIterations: number }
  }
}

// ─── Sprint Contract ───

export interface SprintContract {
  id: string
  name: string
  task: string
  projectId?: string  // which project this sprint belongs to
  status: 'planned' | 'dev' | 'qa' | 'passed' | 'failed' | 'escalated'
  sprintType?: 'code' | 'frontend' | 'research' | 'content' | 'fullstack'
  agentConfig?: {
    generator: { agentId: string; agentName: string }
    evaluator: { agentId: string; agentName: string }
  }
  plannerOutput?: string  // The planner's reasoning for this sprint
  planId?: string         // Links sprints from the same plan
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
  graders: Grader[]  // which graders to run for this sprint
  agentAssignments?: AgentAssignment[]
  outputs?: SprintArtifact[]
  inputs?: SprintInput[]
  dependsOn?: string[]
  humanCheckpoint?: boolean
  deliveryFailures?: DeliveryFailure[]
  activeCandidateIdentity?: DeliveryIdentity
  activeCandidateRound?: number
  // Exact HEAD captured before the first dev action. Finding scope is
  // the cumulative diff from this baseline to each pinned candidate.
  scopeBaselineSha?: string
  iterations: SprintIteration[]
  createdAt: string
  completedAt?: string
}

export interface SprintIteration {
  round: number
  dev?: PhaseResult
  qa?: PhaseResult
  defects: Defect[]
  graderResults?: GraderResult[]  // results from all graders this round
  deliveryFailures?: DeliveryFailure[]
  candidateIdentity?: DeliveryIdentity
  findingsReport?: import('./registrar/types.js').RegistrarReport
}

export interface PhaseResult {
  output: string
  startTime: string
  endTime: string
  durationMs: number
  model: string
  provider?: string
  tokenUsage?: { input: number; output: number }
  costEstimate?: number
}

export interface Defect {
  id: string           // e.g., "P1-01"
  severity: 'p0' | 'p1' | 'p2' | 'p3'
  category?: string
  description: string
  fixed: boolean
  scopeRelationship?: GraderFinding['scopeRelationship']
  releaseImpact?: GraderFinding['releaseImpact']
  evidenceConfidence?: GraderFinding['evidenceConfidence']
  investigationQuestion?: string
  exitCriterion?: string
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
  provider?: string
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
  preflight?(options: ExecuteOptions): Promise<void>
  executeWithAgent?(
    task: string,
    agentId: string,
    options: ExecuteOptions & { designTier?: 'quick' | 'polished' | 'impeccable' },
  ): Promise<AgentResult>
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
  provider?: string
  model?: string
  timing: {
    startMs: number
    endMs: number
    durationMs: number
  }
  tokenUsage?: { input: number; output: number }
  costEstimate?: number
}

// ─── Sprint Transcript ───

export interface SprintTranscript {
  sprintId: string
  phases: TranscriptPhase[]
}

export interface TranscriptPhase {
  phase: 'plan' | 'dev' | 'qa'
  round: number
  actor: string          // 'moe', 'dev', 'quinn', etc.
  model: string
  provider?: string
  startTime: string
  endTime: string
  promptSent: string     // full prompt sent to the agent
  responseReceived: string  // full response from the agent
  tokenUsage?: { input: number; output: number }
  costEstimate?: number
}

// ─── Agent Skills ───

export type SkillType = 'capability' | 'behavioral' | 'workflow'

export interface Skill {
  name: string
  type: SkillType
  description: string
  agentTypes: string[]           // which agent roles can use this: generator, evaluator, researcher
  contextFiles?: string[]        // relative paths to reference files
  gotchas?: string[]
  constraints?: string[]
  persona?: string               // for behavioral skills
  steps?: WorkflowStep[]         // for workflow skills
  tags?: string[]
  source?: SkillSource           // where this was imported from
}

export interface WorkflowStep {
  agent: string
  action: string
  input?: string                 // artifact name from previous step
  output?: string                // artifact name this step produces
}

export interface SkillSource {
  type: 'local' | 'url' | 'claude-code' | 'openclaw' | 'paste'
  uri?: string                   // original URL or file path
  importedAt: string             // ISO timestamp
}

// ─── Sprint Artifacts + Chaining ───

export interface SprintArtifact {
  id: string
  type: 'file' | 'snippet' | 'summary'
  path?: string
  content?: string
  description: string
}

export interface SprintInput {
  from: string                   // "sprint-001.research-findings" format
  injectAs: 'context' | 'reference' | 'cwd'
  resolved?: string              // populated at execution time
}

// ─── Agent Assignment (skill-aware) ───

export interface AgentAssignment {
  agentId: string
  role: 'generator' | 'evaluator' | 'researcher'
  skills: string[]               // skill names activated for this sprint
  skillOverrides?: string        // free-text additions from user
  model?: string                 // override default model
  reasoning: string              // why the planner chose this combo
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
