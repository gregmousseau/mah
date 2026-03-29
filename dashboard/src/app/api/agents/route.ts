import { NextResponse } from "next/server";
import { getAllAgents } from "@/lib/agents";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * GET /api/agents
 * Returns all agents from the registry
 */
export async function GET() {
  try {
    const agents = getAllAgents();
    return NextResponse.json({ agents });
  } catch (err) {
    console.error("Failed to fetch agents:", err);
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}

/**
 * POST /api/agents
 * Adds a new agent by creating a sprint item to configure it
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, role, platform = 'openclaw' } = body;

    if (!name || !role) {
      return NextResponse.json(
        { error: "name and role are required" },
        { status: 400 }
      );
    }

    // Generate sprint ID
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 7);
    const sprintId = `agent-config-${timestamp}-${random}`;

    // Generate agent ID from name (lowercase, replace spaces with hyphens)
    const agentId = name.toLowerCase().replace(/\s+/g, '-');

    // Create sprint contract for agent configuration
    const contract = {
      id: sprintId,
      name: `Configure Agent: ${name}`,
      task: `Configure a new agent in the MAH system:

Agent Name: ${name}
Agent Role: ${role}
Platform: ${platform}

Tasks:
1. Create workspace directory at /home/greg/.openclaw/workspace-${agentId}
2. Add agent entry to AGENT_REGISTRY in dashboard/src/lib/agents.ts
3. Create agent SOUL.md file with personality and instructions
4. Update agent configuration as needed
5. Test agent can be invoked via the system`,
      projectId: undefined,
      status: "approved",
      sprintType: "code",
      agentConfig: {
        generator: { agentId: "dev", agentName: "Devin" },
        evaluator: { agentId: "qa", agentName: "Quinn" },
      },
      agents: {
        generator: { type: "openclaw", model: "claude-sonnet-4-5" },
        evaluator: { type: "openclaw", model: "claude-sonnet-4-5" },
      },
      priorities: { speed: 2, quality: 1, cost: 3 },
      human: {
        checkpoints: ["On completion"],
        notificationChannel: "telegram",
        responseTimeoutMinutes: 30,
        onTimeout: "proceed",
      },
      devBrief: {
        repo: "/home/greg/clawd/projects/mah",
        constraints: [
          "Follow existing agent patterns",
          "Use consistent workspace naming convention",
          "Update centralized registry only",
        ],
        definitionOfDone: [
          "Agent entry exists in AGENT_REGISTRY",
          "Workspace directory created",
          "SOUL.md file created with agent personality",
          "Agent can be selected in sprint builder",
          "No TypeScript errors in registry",
        ],
      },
      qaBrief: {
        tier: "targeted",
        testUrl: "",
        testFocus: [
          "Agent appears in /api/agents response",
          "Agent can be selected in builder UI",
          "Workspace directory exists",
        ],
        passCriteria: [
          "GET /api/agents includes new agent",
          "Agent has all required fields",
          "No TypeScript compilation errors",
        ],
        knownLimitations: [],
      },
      graders: [],
      iterations: [],
      createdAt: new Date().toISOString(),
    };

    // Save sprint contract
    const mahRoot = join(process.cwd(), "..");
    const sprintsDir = join(mahRoot, ".mah", "sprints");
    mkdirSync(sprintsDir, { recursive: true });

    // Find next sprint number
    const existingDirs = existsSync(sprintsDir)
      ? (await import("fs")).readdirSync(sprintsDir)
      : [];
    const sprintNumbers = existingDirs
      .map((d) => {
        const match = d.match(/^(\d+)-/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const nextNumber = sprintNumbers.length > 0 ? Math.max(...sprintNumbers) + 1 : 1;

    const sprintDirName = `${String(nextNumber).padStart(3, '0')}-${contract.name.toLowerCase().replace(/\s+/g, '-').slice(0, 50)}`;
    const sprintDir = join(sprintsDir, sprintDirName);
    mkdirSync(sprintDir, { recursive: true });

    const contractPath = join(sprintDir, "contract.json");
    writeFileSync(contractPath, JSON.stringify(contract, null, 2));

    console.log(`[POST /api/agents] Created agent config sprint: ${sprintDirName}`);

    return NextResponse.json({
      success: true,
      sprintId,
      sprintDir: sprintDirName,
      message: `Agent configuration sprint created: ${sprintDirName}`,
    });
  } catch (err) {
    console.error("Failed to create agent config sprint:", err);
    return NextResponse.json(
      { error: "Failed to create agent config sprint" },
      { status: 500 }
    );
  }
}
