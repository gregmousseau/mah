import { NextResponse } from "next/server";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { buildAgentsInfoString } from "@/lib/agents";

const MAH_ROOT = join(process.cwd(), "..");
const PROJECTS_DIR = join(MAH_ROOT, ".mah", "projects");
const SKILL_DIRS = ["skills", "global-skills", "imported"] as const;

interface PlanRequest {
  prompt: string;
  projectId: string;
  context?: string;
}

// ─── Load available skills catalog ───

function loadSkillsCatalog(): string {
  const skills: { name: string; type: string; description: string; tags: string[]; agentTypes: string[]; gotchaCount: number }[] = [];

  for (const dir of SKILL_DIRS) {
    const fullDir = join(MAH_ROOT, ".mah", dir);
    if (!existsSync(fullDir)) continue;

    const files = readdirSync(fullDir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml"));
    for (const file of files) {
      try {
        const raw = readFileSync(join(fullDir, file), "utf-8");
        // Quick extraction without full YAML parse
        const name = raw.match(/^name:\s*(.+)/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
        const type = raw.match(/^type:\s*(.+)/m)?.[1]?.trim() ?? "capability";
        const desc = raw.match(/^description:\s*['"]?(.+?)['"]?\s*$/m)?.[1]?.trim() ?? "";
        const tagsMatch = raw.match(/^tags:\s*\[(.+)\]/m);
        const tags = tagsMatch ? tagsMatch[1].split(",").map(t => t.trim().replace(/^['"]|['"]$/g, "")) : [];
        const agentTypesMatch = raw.match(/^agent_types:\s*\[(.+)\]/m);
        const agentTypes = agentTypesMatch ? agentTypesMatch[1].split(",").map(t => t.trim().replace(/^['"]|['"]$/g, "")) : [];
        const gotchaCount = (raw.match(/^\s+-\s/gm) || []).length;

        if (name) skills.push({ name, type, description: desc, tags, agentTypes, gotchaCount });
      } catch { /* skip */ }
    }
  }

  if (skills.length === 0) return "No skills available yet.";

  const lines = ["Available agent skills (assign relevant ones to each sprint):"];
  for (const s of skills) {
    const tagsStr = s.tags.length > 0 ? ` [${s.tags.join(", ")}]` : "";
    const agentStr = s.agentTypes.length > 0 ? ` (for: ${s.agentTypes.join(", ")})` : "";
    lines.push(`- **${s.name}** (${s.type}): ${s.description}${tagsStr}${agentStr}${s.gotchaCount > 0 ? ` — ${s.gotchaCount} gotchas` : ""}`);
  }
  return lines.join("\n");
}

// ─── Build planning prompt ───

function buildPlanningPrompt(
  userPrompt: string,
  projectContext: string,
  extraContext?: string
): string {
  const agentsInfo = buildAgentsInfoString();
  const skillsCatalog = loadSkillsCatalog();

  return `You are a senior engineering lead responsible for decomposing work into focused agent sprints.

${projectContext}

${agentsInfo}

## ${skillsCatalog}

## Decomposition Rules

1. Simple tasks that only need one agent = one sprint. Don't over-decompose.
2. Frontend UI work → Frankie (frontend-dev)
3. Backend/logic/bugs/API → Devin (dev)
4. Research/analysis/docs → Reese (research)
5. Content/copy/writing → Connie (content)
6. Mixed frontend+backend → split into separate sprints (backend first, then frontend)
7. Always use Quinn (qa) as the evaluator
8. Keep sprint tasks concrete and actionable — the agent should know exactly what to do
9. For each agent, select the most relevant skills from the catalog above. Only include skills that genuinely help with the task.
10. If the task spans multiple phases (research → write → publish), create separate sprints with dependencies between them.
11. If a sprint produces output that the next sprint needs, list it in expectedOutputs.

## User Request

${userPrompt}${extraContext ? `\n\n## Additional Context\n\n${extraContext}` : ""}

## Instructions

Analyze the request and decompose it into the minimum number of focused sprints needed.
For each sprint, select the most relevant skills from the available catalog.
If the task is a multi-phase pipeline (e.g., research then write then publish), create a chain of sprints with dependencies.

Return ONLY a JSON object (no markdown, no explanation outside the JSON) with this structure:

{
  "reasoning": "Brief explanation of why you decomposed it this way, including skill selection rationale",
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
      "skills": ["skill-name-1", "skill-name-2"],
      "evaluator": {
        "id": "qa",
        "name": "Quinn"
      },
      "suggestedQaTier": "smoke|targeted|full",
      "suggestedDesignTier": "quick|polished|impeccable (frontend sprints only — quick=fast with theme tokens, polished=full design skill, impeccable=pixel perfect with animations. Default quick unless user asks for quality)",
      "dependencies": ["Name of sprint that must complete first, or empty array"],
      "expectedOutputs": [{"id": "artifact-name", "description": "What this sprint produces for downstream use"}],
      "humanCheckpoint": false,
      "estimatedComplexity": "low|medium|high"
    }
  ]
}

Notes:
- skills array should reference skill names from the catalog above (exact match)
- humanCheckpoint: true means the chain pauses after this sprint for human review (use for content before publishing)
- expectedOutputs: list artifacts that downstream sprints will consume
- dependencies: reference sprint names from earlier in the array`;
}

// ─── Claude CLI runner ───

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

// ─── JSON extraction ───

function extractJSON(text: string): unknown {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch { /* try extraction */ }

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

// ─── API handler ───

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
