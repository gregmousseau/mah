import { NextResponse } from "next/server";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["approved", "cancelled"],
  approved: ["queued", "cancelled"],
  scheduled: ["queued", "cancelled"],
  queued: ["running", "cancelled"],
  running: ["passed", "failed", "escalated", "cancelled"],
  passed: [],
  failed: [],
  escalated: ["passed"],
  cancelled: [],
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json() as { status: string; scheduledFor?: string };
    const { status: newStatus, scheduledFor } = body;

    if (!existsSync(SPRINTS_DIR)) {
      return NextResponse.json({ error: "No sprints directory" }, { status: 404 });
    }

    const dirs = readdirSync(SPRINTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const sprintDir = dirs.find(
      (d) => d.startsWith(id) || d.replace(/^0+/, "") === id.replace(/^0+/, "")
    );

    if (!sprintDir) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }

    const contractPath = join(SPRINTS_DIR, sprintDir, "contract.json");
    if (!existsSync(contractPath)) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    const contract = JSON.parse(readFileSync(contractPath, "utf-8"));
    const currentStatus = contract.status as string;

    // Allow force transitions from UI (skip strict validation for now, just warn)
    const allowedNext = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(newStatus)) {
      console.warn(`Status transition ${currentStatus} → ${newStatus} may be invalid for sprint ${id}`);
    }

    const updatedContract = {
      ...contract,
      status: newStatus,
      ...(scheduledFor ? { scheduledFor } : {}),
      ...(newStatus === "queued" ? { queuedAt: new Date().toISOString() } : {}),
      ...(newStatus === "cancelled" ? { cancelledAt: new Date().toISOString() } : {}),
      ...(newStatus === "approved" ? { approvedAt: new Date().toISOString() } : {}),
    };

    writeFileSync(contractPath, JSON.stringify(updatedContract, null, 2));

    return NextResponse.json({ success: true, id, status: newStatus });
  } catch (err) {
    console.error("Status update error:", err);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
