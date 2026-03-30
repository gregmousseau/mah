import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { buildAgentsInfoString } from "@/lib/agents";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");
const PROJECTS_DIR = join(MAH_ROOT, ".mah", "projects");

interface PlanSprintRequest {
  sprintId: string;
}

function buildSingleSprintPlanningPrompt(
  sprintName: string,
  sprintTask: string,
  projectContext: string
): string {
  const agentsInfo = buildAgentsInfoString();
  return `You are a senior engineering lead responsible for planning a focused agent sprint.

${projectContext}

${agentsInfo}

## Sprint Planning Rules

1. Frontend UI work → Frankie (frontend-dev)
2. Backend/logic/bugs/API → Devin (dev)
3. Research/analysis/docs → Reese (research)
4. Content/copy/writing → Connie (content)
5. Always use Quinn (qa) as the evaluator
6. Keep the sprint task concrete and actionable — the agent should know exactly what to do

## Sprint to Plan

**Name:** ${sprintName}
**Task:** ${sprintTask}

## Instructions

Analyze this sprint and return ONLY a JSON object (no markdown, no explanation outside the JSON) with this structure:

{
  "reasoning": "Brief explanation of your agent selection and approach",
  "sprintType": "code|frontend|research|content|fullstack",
  "agent": {
    "id": "dev|frontend-dev|research|content",
    "name": "Devin|Frankie|Reese|Connie",
    "reason": "Why this agent is best for this sprint"
  },
  "evaluator": {
    "id": "qa",
    "name": "Quinn"
  },
  "suggestedQaTier": "smoke|targeted|full",
  "suggestedDesignTier": "quick|polished|impeccable (frontend sprints only — quick=fast with theme tokens, polished=full design skill, impeccable=pixel perfect with animations. Default quick unless high quality requested)",
  "estimatedComplexity": "low|medium|high",
  "dependencies": []
}`;
}

async function runClaudeOpus(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    const claudePath = env.HOME ? `${env.HOME}/.local/bin/claude` : "claude";

    const child = spawn(claudePath, ["--print", "--model", "opus", "--permission-mode", "bypassPermissions"], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.stdin.write(prompt, "utf-8");
    child.stdin.end();

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Planning timed out after 3 minutes"));
    }, 180_000);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Claude exited with code ${code}: ${stderr}`));
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function extractJSON(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch { /* try extraction */ }

  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1]); } catch { /* continue */ }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* continue */ }
  }

  throw new Error("Could not extract JSON from planner output");
}

function findSprintDir(sprintId: string): string | null {
  if (!existsSync(SPRINTS_DIR)) return null;
  const dirs = readdirSync(SPRINTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const found = dirs.find((d) => d === sprintId || d.startsWith(sprintId));
  return found ? join(SPRINTS_DIR, found) : null;
}

export async function POST(request: Request) {
  try {
    const body: PlanSprintRequest = await request.json();
    const { sprintId } = body;

    if (!sprintId || !sprintId.trim()) {
      return NextResponse.json({ error: "sprintId is required" }, { status: 400 });
    }

    // Find and read the sprint contract
    const sprintDir = findSprintDir(sprintId);
    if (!sprintDir) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }

    const contractPath = join(sprintDir, "contract.json");
    if (!existsSync(contractPath)) {
      return NextResponse.json({ error: "Contract file not found" }, { status: 404 });
    }

    const contract = JSON.parse(readFileSync(contractPath, "utf-8"));

    // Load project context if available
    let projectContext = "No project context available.";
    let projectRepo: string | undefined;
    if (contract.projectId) {
      const projectPath = join(PROJECTS_DIR, `${contract.projectId}.json`);
      if (existsSync(projectPath)) {
        const proj = JSON.parse(readFileSync(projectPath, "utf-8"));
        const parts = [`Project: ${proj.name || contract.projectId}`];
        if (proj.repo) {
          parts.push(`Repo: ${proj.repo}`);
          projectRepo = proj.repo;
        }
        if (proj.description) parts.push(`Description: ${proj.description}`);
        projectContext = parts.join("\n");
      }
    }

    // Build planning prompt
    const planningPrompt = buildSingleSprintPlanningPrompt(
      contract.name,
      contract.task,
      projectContext
    );

    // Call planner
    let plannerOutput: string;
    try {
      plannerOutput = await runClaudeOpus(planningPrompt);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Planner call failed:", errorMessage);
      return NextResponse.json(
        {
          error: "Planner failed. Is claude CLI available?",
          details: errorMessage
        },
        { status: 500 }
      );
    }

    // Parse planner output
    let planResult: any;
    try {
      planResult = extractJSON(plannerOutput);
    } catch (err) {
      console.error("Failed to parse planner output:", plannerOutput.slice(0, 500));
      return NextResponse.json(
        { error: "Planner returned invalid JSON", raw: plannerOutput.slice(0, 1000) },
        { status: 500 }
      );
    }

    // Update contract with planning results
    const updatedContract = {
      ...contract,
      status: "planned",
      sprintType: planResult.sprintType || contract.sprintType || "code",
      agentConfig: {
        generator: { agentId: planResult.agent?.id || "dev", agentName: planResult.agent?.name || "Devin" },
        evaluator: { agentId: planResult.evaluator?.id || "qa", agentName: planResult.evaluator?.name || "Quinn" },
      },
      devBrief: {
        ...contract.devBrief,
        repo: projectRepo || contract.devBrief?.repo || ".",
      },
      qaBrief: {
        ...contract.qaBrief,
        tier: planResult.suggestedQaTier || "targeted",
      },
      plannerOutput: planResult.reasoning || "",
      estimatedComplexity: planResult.estimatedComplexity || "medium",
      suggestedDesignTier: planResult.suggestedDesignTier,
      updatedAt: new Date().toISOString(),
    };

    // Save updated contract
    writeFileSync(contractPath, JSON.stringify(updatedContract, null, 2));

    return NextResponse.json({ success: true, contract: updatedContract, plannerOutput });
  } catch (err) {
    console.error("Board plan-sprint error:", err);
    return NextResponse.json({ error: "Failed to plan sprint" }, { status: 500 });
  }
}
