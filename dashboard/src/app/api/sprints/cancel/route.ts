import { NextResponse } from "next/server";
import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");
const QUEUE_DIR = join(MAH_ROOT, ".mah", "queue");
const HEARTBEAT_PATH = join(MAH_ROOT, ".mah", "heartbeat.json");

export async function POST(request: Request) {
  try {
    const { sprintId } = await request.json() as { sprintId: string };

    if (!sprintId) {
      return NextResponse.json({ error: "sprintId required" }, { status: 400 });
    }

    // Find sprint directory
    const dirs = existsSync(SPRINTS_DIR)
      ? readdirSync(SPRINTS_DIR, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      : [];
    const sprintDir = dirs.find(
      (d) =>
        d.startsWith(sprintId) ||
        d.replace(/^0+/, "") === sprintId.replace(/^0+/, "")
    );

    if (!sprintDir) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }

    const contractPath = join(SPRINTS_DIR, sprintDir, "contract.json");
    if (existsSync(contractPath)) {
      const contract = JSON.parse(readFileSync(contractPath, "utf-8"));
      const updatedContract = {
        ...contract,
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      };
      writeFileSync(contractPath, JSON.stringify(updatedContract, null, 2));
    }

    // Write cancel signal file
    const cancelFile = join(MAH_ROOT, ".mah", "cancel.json");
    writeFileSync(
      cancelFile,
      JSON.stringify({ sprintId, requestedAt: new Date().toISOString() }, null, 2)
    );

    // Remove from queue
    const queueFile = join(QUEUE_DIR, `run-${sprintId}.json`);
    if (existsSync(queueFile)) {
      unlinkSync(queueFile);
    }

    // Clear heartbeat
    if (existsSync(HEARTBEAT_PATH)) {
      const hb = JSON.parse(readFileSync(HEARTBEAT_PATH, "utf-8"));
      if (hb.sprintId === sprintId) {
        writeFileSync(
          HEARTBEAT_PATH,
          JSON.stringify({
            ...hb,
            alive: false,
            phase: "cancelled",
            lastUpdate: new Date().toISOString(),
          }, null, 2)
        );
      }
    }

    return NextResponse.json({ status: "cancelled", sprintId });
  } catch (err) {
    console.error("Sprint cancel error:", err);
    return NextResponse.json({ error: "Failed to cancel sprint" }, { status: 500 });
  }
}
