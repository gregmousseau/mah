import { NextResponse } from "next/server";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");

interface SaveRequest {
  contract: Record<string, unknown>;
  scheduledFor?: string;
}

export async function POST(request: Request) {
  try {
    const body: SaveRequest = await request.json();
    const { contract, scheduledFor } = body;

    if (!contract?.id) {
      return NextResponse.json({ error: "Contract with id is required" }, { status: 400 });
    }

    const id = contract.id as string;
    const sprintDir = join(SPRINTS_DIR, id);

    if (!existsSync(sprintDir)) {
      mkdirSync(sprintDir, { recursive: true });
    }

    // Set status based on action
    const savedContract = {
      ...contract,
      status: scheduledFor ? "scheduled" : contract.status === "approved" ? "approved" : "draft",
      scheduledFor: scheduledFor || undefined,
      savedAt: new Date().toISOString(),
    };

    writeFileSync(join(sprintDir, "contract.json"), JSON.stringify(savedContract, null, 2));

    return NextResponse.json({ success: true, id, status: savedContract.status });
  } catch (err) {
    console.error("Builder save error:", err);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
