import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { buildAgentsInfoString } from "@/lib/agents";

const MAH_ROOT = join(process.cwd(), "..");
const PROJECTS_DIR = join(MAH_ROOT, ".mah", "projects");

interface PlanRequest {
  prompt: string;
  projectId: string;
  context?: string;
}

function buildPlanningPrompt(
  userPrompt: string,
  projectContext: string,
  extraContext?: string
): string {
  const agentsInfo = buildAgentsInfoString();
  return `You are a senior engineering lead responsible for decomposing work into focused agent sprints.

${projectContext}

${agentsInfo}

## Decomposition Rules

1. Simple tasks that only need one agent = one sprint. Don't over-decompose.
2. Frontend UI work → Frankie (frontend-dev)
3. Backend/logic/bugs/API → Devin (dev)
4. Research/analysis/docs → Reese (research)
5. Content/copy/writing → Connie (content)
6. Mixed frontend+backend → split into separate sprints (backend first, then frontend)
7. Always use Quinn (qa) as the evaluator
8. Keep sprint tasks concrete and actionable — the agent should know exactly what to do

## User Request

${userPrompt}${extraContext ? `\n\n## Additional Context\n\n${extraContext}` : ""}

## Instructions

Analyze the request and decompose it into the minimum number of focused sprints needed.
Return ONLY a JSON object (no markdown, no explanation outside the JSON) with this structure:

{
  "reasoning": "Brief explanation of why you decomposed it this way",
  "sprints": [
    {
      "name": "Short sprint name (max 60 chars)",
      "task": "Detailed task description — be specific about what needs to be done, what files to change, what the end result should look like",
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
      "dependencies": ["Name of sprint that must complete first, or empty array"],
      "estimatedComplexity": "low|medium|high"
    }
  ]
}`;
}

async function runClaudeOpus(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Unset CLAUDECODE so nested claude invocations aren't blocked
    const env = { ...process.env };
    delete env.CLAUDECODE;
    // Use full path to claude in case PATH isn't inherited
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
  // Try direct parse first
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch { /* try extraction */ }

  // Try to find JSON block
  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1]); } catch { /* continue */ }
  }

  // Find first { and last }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* continue */ }
  }

  throw new Error("Could not extract JSON from planner output");
}

export async function POST(request: Request) {
  try {
    const body: PlanRequest = await request.json();
    const { prompt, projectId, context } = body;

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Load project config
    let projectContext = "No project context available.";
    if (projectId) {
      const projectPath = join(PROJECTS_DIR, `${projectId}.json`);
      if (existsSync(projectPath)) {
        const proj = JSON.parse(readFileSync(projectPath, "utf-8"));
        const parts = [`Project: ${proj.name || projectId}`];
        if (proj.repo) parts.push(`Repo: ${proj.repo}`);
        if (proj.description) parts.push(`Description: ${proj.description}`);
        projectContext = parts.join("\n");
      }
    }

    const planningPrompt = buildPlanningPrompt(prompt, projectContext, context);

    let plannerOutput: string;
    try {
      plannerOutput = await runClaudeOpus(planningPrompt);
    } catch (err) {
      console.error("Planner call failed:", err);
      return NextResponse.json(
        { error: "Planner failed. Is claude CLI available?" },
        { status: 500 }
      );
    }

    let plan: unknown;
    try {
      plan = extractJSON(plannerOutput);
    } catch (err) {
      console.error("Failed to parse planner output:", plannerOutput.slice(0, 500));
      return NextResponse.json(
        { error: "Planner returned invalid JSON", raw: plannerOutput.slice(0, 1000) },
        { status: 500 }
      );
    }

    return NextResponse.json({ plan, raw: plannerOutput });
  } catch (err) {
    console.error("Plan API error:", err);
    return NextResponse.json({ error: "Planning failed" }, { status: 500 });
  }
}
