import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");

interface UpdateDraftRequest {
  sprintId: string;
  updates: {
    name?: string;
    task?: string;
    projectId?: string;
    sprintType?: string;
    agentConfig?: {
      generator?: { agentId: string; agentName: string };
      evaluator?: { agentId: string; agentName: string };
    };
    qaBrief?: {
      tier?: string;
      testUrl?: string;
      testFocus?: string[];
      passCriteria?: string[];
      knownLimitations?: string[];
    };
    devBrief?: {
      repo?: string;
      constraints?: string[];
      definitionOfDone?: string[];
    };
  };
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
    const body: UpdateDraftRequest = await request.json();
    const { sprintId, updates } = body;

    if (!sprintId || !sprintId.trim()) {
      return NextResponse.json({ error: "sprintId is required" }, { status: 400 });
    }

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
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

    // Only allow updating drafts
    if (contract.status !== "draft" && contract.status !== "scheduled" && contract.status !== "approved") {
      return NextResponse.json(
        { error: "Can only update draft, scheduled, or approved sprints" },
        { status: 400 }
      );
    }

    // Apply updates
    const updatedContract = {
      ...contract,
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.task !== undefined && { task: updates.task }),
      ...(updates.projectId !== undefined && { projectId: updates.projectId }),
      ...(updates.sprintType !== undefined && { sprintType: updates.sprintType }),
      ...(updates.agentConfig && {
        agentConfig: {
          ...contract.agentConfig,
          ...(updates.agentConfig.generator && { generator: updates.agentConfig.generator }),
          ...(updates.agentConfig.evaluator && { evaluator: updates.agentConfig.evaluator }),
        },
      }),
      ...(updates.devBrief && {
        devBrief: {
          ...contract.devBrief,
          ...updates.devBrief,
        },
      }),
      ...(updates.qaBrief && {
        qaBrief: {
          ...contract.qaBrief,
          ...updates.qaBrief,
        },
      }),
      updatedAt: new Date().toISOString(),
    };

    // Save updated contract
    writeFileSync(contractPath, JSON.stringify(updatedContract, null, 2));

    return NextResponse.json({ success: true, contract: updatedContract });
  } catch (err) {
    console.error("Board update-draft error:", err);
    return NextResponse.json({ error: "Failed to update draft" }, { status: 500 });
  }
}
