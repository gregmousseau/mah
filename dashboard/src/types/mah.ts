// ─── Grader System ───────────────────────────────────────────────────────────

export interface Grader {
  id: string;
  type: "ux" | "code-review" | "accessibility" | "performance" | "custom";
  name: string;
  agent: { type: string; model: string; cwd?: string; workspace?: string; testUrl?: string };
  enabled: boolean;
}

export interface GraderFinding {
  id: string;
  severity: "critical" | "major" | "minor" | "info";
  category: string;
  file?: string;
  line?: number;
  description: string;
  suggestion?: string;
}

export interface GraderResult {
  graderId: string;
  graderType: string;
  graderName: string;
  verdict: "pass" | "conditional" | "fail";
  findings: GraderFinding[];
  summary: string;
  model: string;
  durationMs: number;
  costEstimate: number;
}

// ─── Transcript ───────────────────────────────────────────────────────────────

export interface SprintTranscript {
  sprintId: string;
  phases: TranscriptPhase[];
}

export interface TranscriptPhase {
  phase: "plan" | "dev" | "qa";
  round: number;
  actor: string;
  model: string;
  startTime: string;
  endTime: string;
  promptSent: string;
  responseReceived: string;
  tokenUsage?: { input: number; output: number };
  costEstimate?: number;
}

export interface Defect {
  id: string;
  severity: "p0" | "p1" | "p2" | "p3";
  description: string;
  fixed: boolean;
}

export interface DevRound {
  output: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  model: string;
  costEstimate: number;
}

export interface QARound {
  output: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  model: string;
  costEstimate: number;
}

export interface Iteration {
  round: number;
  dev: DevRound;
  qa: QARound;
  defects: Defect[];
  graderResults?: GraderResult[];
}

export interface AgentRoutingConfig {
  agentId: string;
  agentName: string;
}

export interface SprintContract {
  id: string;
  name: string;
  task: string;
  projectId?: string;
  status: "draft" | "approved" | "queued" | "scheduled" | "planned" | "dev" | "qa" | "running" | "passed" | "failed" | "escalated" | "cancelled";
  scheduledFor?: string;
  queuedAt?: string;
  cancelledAt?: string;
  graders?: Grader[];
  nextSteps?: string[];
  sprintType?: "code" | "frontend" | "research" | "content" | "fullstack";
  agentConfig?: {
    generator: AgentRoutingConfig;
    evaluator: AgentRoutingConfig;
  };
  plannerOutput?: string;
  planId?: string;
  devBrief: {
    repo: string;
    constraints: string[];
    definitionOfDone: string[];
  };
  qaBrief: {
    tier: string;
    testUrl: string;
    testFocus: string[];
    passCriteria: string[];
    knownLimitations: string[];
  };
  iterations: Iteration[];
  createdAt: string;
  completedAt?: string;
}

// ─── Sprint Plan (from planner) ───────────────────────────────────────────────

export interface SprintPlanItem {
  name: string;
  task: string;
  sprintType: "code" | "frontend" | "research" | "content" | "fullstack";
  agent: { id: string; name: string; reason: string };
  evaluator: { id: string; name: string };
  suggestedQaTier: "smoke" | "targeted" | "full";
  suggestedDesignTier?: "quick" | "polished" | "impeccable";
  dependencies: string[];
  estimatedComplexity: "low" | "medium" | "high";
}

export interface SprintPlan {
  reasoning: string;
  sprints: SprintPlanItem[];
}

export interface Phase {
  phase: "plan" | "dev" | "qa";
  round: number;
  durationMs: number;
  model: string;
  costEstimate: number;
}

export interface SprintMetrics {
  sprintId: string;
  projectName: string;
  task: string;
  startTime: string;
  endTime?: string;
  phases: Phase[];
  totals: {
    durationMs: number;
    estimatedCost: number;
    iterations: number;
    humanWaitMs: number;
  };
  quality: {
    defectsFound: Record<string, number>;
    defectsFixed: Record<string, number>;
    defectsRemaining: Record<string, number>;
  };
  verdict: "pass" | "fail" | "conditional";
  bottleneck: string;
}

export interface MahEvent {
  ts: string;
  local: string;
  actor: string;
  type: string;
  phase: string;
  summary: string;
  detail?: string;
}

export interface MahConfig {
  project: { name: string; repo: string };
  priorities: { speed: number; quality: number; cost: number };
  agents: Record<string, { type: string; model: string; cwd?: string; workspace?: string; testUrl?: string }>;
  qa: { defaultTier: string; maxIterations: number };
}

export interface SprintSummary {
  id: string;
  name: string;
  status: string;
  verdict: string;
  iterations: number;
  totalCost: number;
  createdAt: string;
  completedAt?: string;
  scheduledFor?: string;
  projectId?: string;
  agentConfig?: {
    generator: AgentRoutingConfig;
    evaluator: AgentRoutingConfig;
  } | null;
  sprintType?: string | null;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  repo?: string;
  createdAt: string;
  config?: {
    priorities?: { speed: number; quality: number; cost: number };
    defaultAgents?: { generator: { type: string; model: string }; evaluator: { type: string; model: string } };
    qa?: { defaultTier: string; maxIterations: number };
  };
  // Computed stats
  sprintCount?: number;
  passRate?: number;
  totalCost?: number;
  lastSprintDate?: string;
}

export interface ProjectWithSprints extends Project {
  sprints: SprintSummary[];
}
