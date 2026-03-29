import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const PROJECTS_DIR = join(MAH_ROOT, ".mah", "projects");

interface GenerateRequest {
  prompt: string;
  projectId: string;
  context?: string;
}

// Model cost tiers
const MODEL_COSTS: Record<string, { tier: "$" | "$$" | "$$$"; devLow: number; devHigh: number }> = {
  "claude-haiku-3-5": { tier: "$", devLow: 0.05, devHigh: 0.20 },
  "claude-sonnet-4-5": { tier: "$$", devLow: 0.15, devHigh: 0.50 },
  "claude-opus-4": { tier: "$$$", devLow: 0.50, devHigh: 2.00 },
};

const QA_COSTS: Record<string, { low: number; high: number }> = {
  smoke: { low: 0.10, high: 0.30 },
  targeted: { low: 0.50, high: 1.50 },
  full: { low: 2.00, high: 5.00 },
};

function suggestQaTier(prompt: string): { tier: "smoke" | "targeted" | "full"; reason: string } {
  const lower = prompt.toLowerCase();
  if (/\b(rebuild|redesign|rewrite|migrate|overhaul|rearchitect)\b/.test(lower)) {
    return { tier: "full", reason: "Major rework detected — full matrix needed to catch regressions." };
  }
  if (/\b(fix|bug|issue|error|broken|patch|hotfix)\b/.test(lower)) {
    return { tier: "smoke", reason: "Bug fix — smoke test to confirm the fix without full regression." };
  }
  return { tier: "targeted", reason: "New feature — targeted tests on key flows." };
}

function suggestModel(prompt: string, priorities?: { speed: number; quality: number; cost: number }): { model: string; reason: string } {
  if (priorities) {
    const sorted = Object.entries(priorities).sort((a, b) => a[1] - b[1]);
    const top = sorted[0][0];
    if (top === "cost") return { model: "claude-haiku-3-5", reason: "Cost is top priority — Haiku keeps spend low." };
    if (top === "quality") return { model: "claude-opus-4", reason: "Quality is top priority — Opus for best results." };
  }
  return { model: "claude-sonnet-4-5", reason: "Balanced speed and quality." };
}

function extractTaskName(prompt: string): string {
  const firstSentence = prompt.split(/[.\n]/)[0].trim();
  if (firstSentence.length <= 60) return firstSentence;
  return firstSentence.slice(0, 57) + "...";
}

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `draft-${ts}-${rand}`;
}

function suggestCheckpoints(priorities?: { speed: number; quality: number; cost: number }): string[] {
  if (!priorities) return ["On completion", "On escalation"];
  const sorted = Object.entries(priorities).sort((a, b) => a[1] - b[1]);
  const top = sorted[0][0];
  if (top === "quality") return ["Before running", "On QA failure", "On completion", "On escalation"];
  if (top === "cost") return ["On QA failure", "On escalation"];
  return ["On completion", "On escalation"];
}

export async function POST(request: Request) {
  try {
    const body: GenerateRequest = await request.json();
    const { prompt, projectId, context } = body;

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Load project config
    let projectConfig: Record<string, unknown> | null = null;
    const projectPath = join(PROJECTS_DIR, `${projectId}.json`);
    if (existsSync(projectPath)) {
      projectConfig = JSON.parse(readFileSync(projectPath, "utf-8"));
    }

    const priorities = (projectConfig?.config as Record<string, unknown> | undefined)?.priorities as
      | { speed: number; quality: number; cost: number }
      | undefined;
    const repo = (projectConfig?.repo as string) || "";
    const defaultAgents = (projectConfig?.config as Record<string, unknown> | undefined)?.defaultAgents as
      | { generator: { model: string; type: string }; evaluator: { model: string; type: string } }
      | undefined;
    const defaultQa = (projectConfig?.config as Record<string, unknown> | undefined)?.qa as
      | { defaultTier: string; maxIterations: number }
      | undefined;

    const taskName = extractTaskName(prompt);
    const qaSuggestion = suggestQaTier(prompt);
    const modelSuggestion = suggestModel(prompt, priorities);
    const tier = qaSuggestion.tier;
    const model = modelSuggestion.model;
    const humanCheckpoints = suggestCheckpoints(priorities);

    // Build default constraints from context
    const constraints: string[] = [];
    if (context?.trim()) {
      constraints.push(context.trim());
    }
    constraints.push("Follow existing code patterns and conventions");
    constraints.push("Maintain backward compatibility");

    const id = generateId();
    const now = new Date().toISOString();

    const contract = {
      id,
      name: taskName,
      task: prompt.trim(),
      projectId: projectId || undefined,
      status: "draft" as const,
      agents: {
        generator: defaultAgents?.generator || { type: "openclaw", model },
        evaluator: defaultAgents?.evaluator || { type: "openclaw", model },
      },
      priorities: priorities || { speed: 2, quality: 1, cost: 3 },
      human: {
        checkpoints: humanCheckpoints,
        notificationChannel: "telegram",
        responseTimeoutMinutes: 30,
        onTimeout: "proceed" as const,
      },
      devBrief: {
        repo: repo || ".",
        constraints,
        definitionOfDone: [
          "Feature works as described",
          "No regressions introduced",
          "Code follows project conventions",
          "Tests pass",
        ],
      },
      qaBrief: {
        tier,
        testUrl: "",
        testFocus: ["Core functionality", "Edge cases", "Mobile responsiveness"],
        passCriteria: ["Zero P0 defects", "Zero P1 defects", "P2 defects documented"],
        knownLimitations: [] as string[],
      },
      iterations: [],
      createdAt: now,
    };

    // Cost estimates
    const modelCosts = MODEL_COSTS[model] || MODEL_COSTS["claude-sonnet-4-5"];
    const qaCosts = QA_COSTS[tier];
    const estimatedIterations = defaultQa?.maxIterations || 2;

    const costEstimate = {
      devLow: modelCosts.devLow * estimatedIterations,
      devHigh: modelCosts.devHigh * estimatedIterations,
      qaLow: qaCosts.low * estimatedIterations,
      qaHigh: qaCosts.high * estimatedIterations,
      totalLow: modelCosts.devLow * estimatedIterations + qaCosts.low * estimatedIterations,
      totalHigh: modelCosts.devHigh * estimatedIterations + qaCosts.high * estimatedIterations,
      estimatedIterations,
    };

    return NextResponse.json({
      contract,
      costEstimate,
      suggestions: {
        qaTier: tier,
        qaTierReason: qaSuggestion.reason,
        model,
        modelReason: modelSuggestion.reason,
        humanCheckpoints,
      },
    });
  } catch (err) {
    console.error("Builder generate error:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
