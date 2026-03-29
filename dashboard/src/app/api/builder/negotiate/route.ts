import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { getAgentWorkspace, getAgentName } from "@/lib/agents";

function readFileSafe(path: string): string | null {
  try {
    if (existsSync(path)) return readFileSync(path, "utf-8");
  } catch { /* ignore */ }
  return null;
}

function getAgentSoul(agentId: string): string {
  const workspace = getAgentWorkspace(agentId);
  if (!workspace || !existsSync(workspace)) return "";
  return readFileSafe(join(workspace, "SOUL.md")) ?? "";
}

async function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    const claudePath = env.HOME ? `${env.HOME}/.local/bin/claude` : "claude";

    const child = spawn(claudePath, ["--print", "--model", "sonnet", "--permission-mode", "bypassPermissions"], {
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
      reject(new Error("Negotiation call timed out after 60s"));
    }, 60_000);

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

interface SprintSpec {
  name: string;
  task: string;
  sprintType?: string;
  agent: { id: string; name: string; reason?: string };
  evaluator: { id: string; name: string };
  suggestedQaTier?: string;
  estimatedComplexity?: string;
  devBrief?: { repo: string; constraints: string[]; definitionOfDone: string[] };
  qaBrief?: { tier: string; testUrl: string; testFocus: string[]; passCriteria: string[]; knownLimitations: string[] };
}

interface NegotiateRequest {
  sprint: SprintSpec;
  projectId?: string;
}

export async function POST(request: Request) {
  try {
    const body: NegotiateRequest = await request.json();
    const { sprint } = body;

    if (!sprint?.name) {
      return NextResponse.json({ error: "Sprint spec required" }, { status: 400 });
    }

    const generatorId = sprint.agent.id;
    const evaluatorId = sprint.evaluator.id;
    const generatorName = getAgentName(generatorId) || sprint.agent.name;
    const evaluatorName = getAgentName(evaluatorId) || sprint.evaluator.name;

    const generatorSoul = getAgentSoul(generatorId);
    const evaluatorSoul = getAgentSoul(evaluatorId);

    // Step 1: Generator proposes definition of done
    const generatorPromptPrefix = generatorSoul
      ? `You are ${generatorName}.\n\n${generatorSoul}\n\n---\n\n`
      : `You are ${generatorName}, a software developer.\n\n`;

    const generatorPrompt = `${generatorPromptPrefix}Review this sprint contract and propose your specific definition of done.

Sprint Name: ${sprint.name}
Sprint Type: ${sprint.sprintType || "code"}
Task: ${sprint.task}
QA Tier: ${sprint.suggestedQaTier || "targeted"}
Complexity: ${sprint.estimatedComplexity || "medium"}

Respond concisely (200-400 words). Cover:
1. Which files you will change or create
2. What the user will see/experience when done
3. Your specific definition of done (bullet list, 3-6 items)
4. Key constraints or assumptions
5. Edge cases you'll handle

Be specific and concrete. No fluff.`;

    let generatorResponse: string;
    try {
      generatorResponse = await runClaude(generatorPrompt);
    } catch (err) {
      console.error("Generator negotiation failed:", err);
      generatorResponse = `[Generator (${generatorName}) negotiation unavailable — claude CLI may not be accessible]`;
    }

    // Step 2: Evaluator tightens pass criteria based on generator's DoD
    const evaluatorPromptPrefix = evaluatorSoul
      ? `You are ${evaluatorName}.\n\n${evaluatorSoul}\n\n---\n\n`
      : `You are ${evaluatorName}, a QA engineer.\n\n`;

    const evaluatorPrompt = `${evaluatorPromptPrefix}Review this sprint contract and the developer's proposed definition of done. Tighten the pass criteria.

Sprint Name: ${sprint.name}
Sprint Type: ${sprint.sprintType || "code"}
Task: ${sprint.task}
QA Tier: ${sprint.suggestedQaTier || "targeted"}

Developer's Proposed Definition of Done:
${generatorResponse}

Respond concisely (200-400 words). Cover:
1. Specific things you will test (3-6 test cases)
2. Exact pass criteria (what must be true for this sprint to pass)
3. What would make you fail this sprint (failure criteria)
4. Any edge cases the developer missed

Be specific and actionable. No fluff.`;

    let evaluatorResponse: string;
    try {
      evaluatorResponse = await runClaude(evaluatorPrompt);
    } catch (err) {
      console.error("Evaluator negotiation failed:", err);
      evaluatorResponse = `[Evaluator (${evaluatorName}) negotiation unavailable — claude CLI may not be accessible]`;
    }

    // Build enriched sprint with negotiated devBrief and qaBrief
    const negotiated: SprintSpec = {
      ...sprint,
      devBrief: {
        repo: sprint.devBrief?.repo || ".",
        constraints: sprint.devBrief?.constraints || ["Follow existing code patterns and conventions"],
        definitionOfDone: extractBulletPoints(generatorResponse) || [
          "Feature works as described",
          "No regressions introduced",
          "Code follows project conventions",
        ],
      },
      qaBrief: {
        tier: sprint.suggestedQaTier || "targeted",
        testUrl: sprint.qaBrief?.testUrl || "",
        testFocus: extractBulletPoints(evaluatorResponse).slice(0, 4) || ["Core functionality"],
        passCriteria: extractBulletPoints(evaluatorResponse).slice(0, 5) || ["Zero P0 defects", "Zero P1 defects"],
        knownLimitations: [],
      },
    };

    return NextResponse.json({
      negotiated,
      generatorBrief: generatorResponse,
      evaluatorBrief: evaluatorResponse,
    });
  } catch (err) {
    console.error("Negotiate API error:", err);
    return NextResponse.json({ error: "Negotiation failed" }, { status: 500 });
  }
}

function extractBulletPoints(text: string): string[] {
  const lines = text.split("\n");
  const bullets: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Match lines starting with -, *, •, or numbered like 1. 2. etc
    if (/^[-*•]\s+.+/.test(trimmed)) {
      bullets.push(trimmed.replace(/^[-*•]\s+/, "").trim());
    } else if (/^\d+\.\s+.+/.test(trimmed)) {
      bullets.push(trimmed.replace(/^\d+\.\s+/, "").trim());
    }
  }
  return bullets.filter(b => b.length > 5 && b.length < 200);
}
