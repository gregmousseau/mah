import { NextResponse } from "next/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");
const QUEUE_DIR = join(MAH_ROOT, ".mah", "queue");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { contractId, contract: inlineContract } = body as {
      contractId?: string;
      contract?: Record<string, unknown>;
    };

    // Resolve the contract
    let contract: Record<string, unknown>;
    let sprintId: string;

    if (inlineContract && inlineContract.id) {
      contract = inlineContract;
      sprintId = inlineContract.id as string;
    } else if (contractId) {
      sprintId = contractId;
      const dirs = existsSync(SPRINTS_DIR)
        ? require("fs").readdirSync(SPRINTS_DIR, { withFileTypes: true })
            .filter((d: { isDirectory: () => boolean }) => d.isDirectory())
            .map((d: { name: string }) => d.name)
        : [];
      const sprintDir = dirs.find(
        (d: string) =>
          d.startsWith(contractId) ||
          d.replace(/^0+/, "") === contractId.replace(/^0+/, "")
      );
      if (!sprintDir) {
        return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
      }
      const contractPath = join(SPRINTS_DIR, sprintDir, "contract.json");
      if (!existsSync(contractPath)) {
        return NextResponse.json({ error: "Contract file not found" }, { status: 404 });
      }
      contract = JSON.parse(readFileSync(contractPath, "utf-8"));
    } else {
      return NextResponse.json(
        { error: "contractId or contract required" },
        { status: 400 }
      );
    }

    // Ensure sprint directory exists
    const sprintDirPath = join(SPRINTS_DIR, sprintId);
    if (!existsSync(sprintDirPath)) {
      mkdirSync(sprintDirPath, { recursive: true });
    }

    // Update contract status to queued
    const updatedContract = {
      ...contract,
      status: "queued",
      queuedAt: new Date().toISOString(),
    };
    writeFileSync(
      join(sprintDirPath, "contract.json"),
      JSON.stringify(updatedContract, null, 2)
    );

    // Write initial heartbeat
    const heartbeatPath = join(MAH_ROOT, ".mah", "heartbeat.json");
    const heartbeat = {
      alive: true,
      phase: "queued",
      round: 0,
      elapsed: 0,
      sprintId,
      lastUpdate: new Date().toISOString(),
    };
    writeFileSync(heartbeatPath, JSON.stringify(heartbeat, null, 2));

    // Write run request to queue
    if (!existsSync(QUEUE_DIR)) {
      mkdirSync(QUEUE_DIR, { recursive: true });
    }
    const queueFile = join(QUEUE_DIR, `run-${sprintId}.json`);
    const queueEntry = {
      sprintId,
      contractPath: join(sprintDirPath, "contract.json"),
      requestedAt: new Date().toISOString(),
      status: "pending",
    };
    writeFileSync(queueFile, JSON.stringify(queueEntry, null, 2));

    return NextResponse.json({
      status: "started",
      sprintId,
      message: `Sprint ${sprintId} queued for execution`,
    });
  } catch (err) {
    console.error("Sprint run error:", err);
    return NextResponse.json({ error: "Failed to queue sprint" }, { status: 500 });
  }
}
