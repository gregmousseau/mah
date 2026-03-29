import { NextResponse } from "next/server";
import { existsSync, readdirSync, readFileSync, writeFileSync, renameSync } from "fs";
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function getNextSequentialId(): string {
  if (!existsSync(SPRINTS_DIR)) return "001";

  const dirs = readdirSync(SPRINTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let maxId = 0;
  for (const dir of dirs) {
    const match = dir.match(/^(\d{3})-/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxId) maxId = num;
    }
  }

  const next = maxId + 1;
  return String(next).padStart(3, "0");
}

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

    let finalId = id;
    let finalSprintDir = sprintDir;

    // On approval: assign sequential numeric ID if needed, then update status
    if (newStatus === "approved") {
      const currentId = (contract.id as string) ?? id;
      const alreadyNumeric = /^\d{3}$/.test(currentId);

      if (alreadyNumeric) {
        // Already has a sequential ID — just update status
        contract.status = newStatus;
        contract.approvedAt = new Date().toISOString();
        if (scheduledFor) contract.scheduledFor = scheduledFor;
        writeFileSync(contractPath, JSON.stringify(contract, null, 2));

        return NextResponse.json({
          success: true,
          id: currentId,
          status: newStatus,
        });
      }

      // Draft/temp ID — assign sequential numeric ID and rename directory
      const numericId = getNextSequentialId();
      const sprintName = (contract.name as string) ?? "sprint";
      const slug = slugify(sprintName);
      const newDirName = `${numericId}-${slug}`;
      const oldDirPath = join(SPRINTS_DIR, sprintDir);
      const newDirPath = join(SPRINTS_DIR, newDirName);

      // Update contract with new numeric ID
      contract.id = numericId;
      contract.status = newStatus;
      contract.approvedAt = new Date().toISOString();
      if (scheduledFor) contract.scheduledFor = scheduledFor;

      // Write updated contract to old location first
      writeFileSync(contractPath, JSON.stringify(contract, null, 2));

      // Rename the directory
      if (sprintDir !== newDirName) {
        renameSync(oldDirPath, newDirPath);
      }

      finalId = numericId;
      finalSprintDir = newDirName;

      return NextResponse.json({
        success: true,
        id: numericId,
        previousId: id,
        sprintDir: newDirName,
        status: newStatus,
      });
    }

    const updatedContract = {
      ...contract,
      status: newStatus,
      ...(scheduledFor ? { scheduledFor } : {}),
      ...(newStatus === "queued" ? { queuedAt: new Date().toISOString() } : {}),
      ...(newStatus === "cancelled" ? { cancelledAt: new Date().toISOString() } : {}),
    };

    const updatedContractPath = join(SPRINTS_DIR, finalSprintDir, "contract.json");
    writeFileSync(updatedContractPath, JSON.stringify(updatedContract, null, 2));

    return NextResponse.json({ success: true, id: finalId, status: newStatus });
  } catch (err) {
    console.error("Status update error:", err);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
