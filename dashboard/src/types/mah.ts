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
}

export interface SprintContract {
  id: string;
  name: string;
  task: string;
  projectId?: string;
  status: "planned" | "dev" | "qa" | "passed" | "failed" | "escalated" | "running";
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
  projectId?: string;
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
