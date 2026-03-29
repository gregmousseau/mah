import { NextResponse } from "next/server";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");
const QUEUE_DIR = join(MAH_ROOT, ".mah", "queue");
const QUEUE_FILE = join(QUEUE_DIR, "queue.json");
const EXECUTOR_SCRIPT = join(process.cwd(), "executor.mjs");

interface QueueRunning {
  sprintId: string;
  sprintName?: string;
  startedAt: string;
  pid?: number;
}

interface QueuePending {
  sprintId: string;
  sprintName?: string;
  queuedAt: string;
}

interface QueueCompleted {
  sprintId: string;
  sprintName?: string;
  completedAt: string;
  status: string;
}

interface QueueState {
  running: QueueRunning | null;
  pending: QueuePending[];
  completed: QueueCompleted[];
}

function readQueue(): QueueState {
  if (!existsSync(QUEUE_FILE)) {
    return { running: null, pending: [], completed: [] };
  }
  try {
    return JSON.parse(readFileSync(QUEUE_FILE, "utf-8"));
  } catch {
    return { running: null, pending: [], completed: [] };
  }
}

function writeQueue(state: QueueState): void {
  mkdirSync(QUEUE_DIR, { recursive: true });
  writeFileSync(QUEUE_FILE, JSON.stringify(state, null, 2));
}

function isSprintRunning(): boolean {
  // Check queue.json first
  const queue = readQueue();
  if (queue.running) return true;

  // Also check heartbeat as fallback
  const heartbeatPath = join(MAH_ROOT, ".mah", "heartbeat.json");
  if (existsSync(heartbeatPath)) {
    try {
      const hb = JSON.parse(readFileSync(heartbeatPath, "utf-8"));
      if (hb.alive === true) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

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
  return String(maxId + 1).padStart(3, "0");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { contractId, contract: inlineContract, enqueue = false } = body as {
      contractId?: string;
      contract?: Record<string, unknown>;
      enqueue?: boolean;
    };

    // Resolve the contract
    let contract: Record<string, unknown>;
    let sprintId: string;
    let sprintDirName: string;

    if (inlineContract && inlineContract.id) {
      contract = inlineContract;
      sprintId = inlineContract.id as string;

      // Find the sprint dir
      const dirs = existsSync(SPRINTS_DIR)
        ? readdirSync(SPRINTS_DIR, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name)
        : [];
      const found = dirs.find(
        (d) =>
          d.startsWith(sprintId) ||
          d.replace(/^0+/, "") === sprintId.replace(/^0+/, "")
      );
      sprintDirName = found ?? sprintId;
    } else if (contractId) {
      sprintId = contractId;
      const dirs = existsSync(SPRINTS_DIR)
        ? readdirSync(SPRINTS_DIR, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name)
        : [];
      const sprintDir = dirs.find(
        (d) =>
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
      sprintDirName = sprintDir;
    } else {
      return NextResponse.json(
        { error: "contractId or contract required" },
        { status: 400 }
      );
    }

    // Ensure sprint directory exists
    let sprintFullPath = join(SPRINTS_DIR, sprintDirName);
    if (!existsSync(sprintFullPath)) {
      mkdirSync(sprintFullPath, { recursive: true });
    }

    // Assign sequential ID if this is a draft/non-numeric ID
    const isNumericId = /^\d{3}$/.test(sprintId);
    if (!isNumericId) {
      const numericId = getNextSequentialId();
      const sprintName = (contract.name as string) ?? "sprint";
      const slug = slugify(sprintName);
      const newDirName = `${numericId}-${slug}`;
      const newDirPath = join(SPRINTS_DIR, newDirName);

      // Rename directory
      renameSync(sprintFullPath, newDirPath);
      sprintFullPath = newDirPath;
      sprintDirName = newDirName;

      // Update contract with new ID
      contract.id = numericId;
      contract.previousId = sprintId;
      sprintId = numericId;

      console.log(`[run] Assigned sequential ID: ${numericId} (was: ${contract.previousId})`);
    }

    const sprintName = (contract.name as string) ?? "";

    // Check if a sprint is already running
    if (isSprintRunning() || enqueue) {
      // Add to pending queue
      const queue = readQueue();

      // Don't double-queue
      const alreadyPending = queue.pending.some((p) => p.sprintId === sprintId);
      if (!alreadyPending) {
        // Update contract status to queued
        const updatedContract = {
          ...contract,
          status: "queued",
          queuedAt: new Date().toISOString(),
        };
        writeFileSync(
          join(sprintFullPath, "contract.json"),
          JSON.stringify(updatedContract, null, 2)
        );

        queue.pending.push({
          sprintId,
          sprintName,
          queuedAt: new Date().toISOString(),
        });
        writeQueue(queue);
      }

      const position = queue.pending.length;
      return NextResponse.json({
        status: "queued",
        sprintId,
        position,
        message: `Sprint ${sprintId} queued at position ${position}`,
      });
    }

    // No sprint running — start immediately
    const updatedContract = {
      ...contract,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    writeFileSync(
      join(sprintFullPath, "contract.json"),
      JSON.stringify(updatedContract, null, 2)
    );

    // Write initial heartbeat
    const heartbeatPath = join(MAH_ROOT, ".mah", "heartbeat.json");
    const heartbeat = {
      alive: true,
      phase: "starting",
      round: 0,
      elapsed: 0,
      sprintId,
      sprintName,
      lastUpdate: new Date().toISOString(),
    };
    writeFileSync(heartbeatPath, JSON.stringify(heartbeat, null, 2));

    // Update queue.json: set as running
    if (!existsSync(QUEUE_DIR)) {
      mkdirSync(QUEUE_DIR, { recursive: true });
    }
    const queue = readQueue();
    queue.running = {
      sprintId,
      sprintName,
      startedAt: new Date().toISOString(),
    };
    writeQueue(queue);

    // Also write to legacy queue file (backward compat)
    const legacyQueueFile = join(QUEUE_DIR, `run-${sprintId}.json`);
    writeFileSync(legacyQueueFile, JSON.stringify({
      sprintId,
      contractPath: join(sprintFullPath, "contract.json"),
      requestedAt: new Date().toISOString(),
      status: "running",
    }, null, 2));

    // Spawn executor as a detached background process
    if (!existsSync(EXECUTOR_SCRIPT)) {
      console.warn(`[run] Executor script not found at ${EXECUTOR_SCRIPT} — sprint queued but not started`);
      return NextResponse.json({
        status: "queued",
        sprintId,
        message: `Sprint ${sprintId} queued (executor not found — run manually)`,
      });
    }

    const child = spawn(
      process.execPath,
      [EXECUTOR_SCRIPT, sprintFullPath],
      {
        cwd: MAH_ROOT,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          MAH_ROOT,
        },
      }
    );

    // Log executor output to sprint dir
    const logPath = join(sprintFullPath, "executor.log");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const logStream = require("fs").createWriteStream(logPath, { flags: "a" });
    child.stdout?.pipe(logStream);
    child.stderr?.pipe(logStream);

    // Update queue with PID
    queue.running!.pid = child.pid;
    writeQueue(queue);

    child.unref();

    console.log(`[run] Spawned executor for sprint ${sprintId} (pid: ${child.pid})`);

    return NextResponse.json({
      status: "started",
      sprintId,
      pid: child.pid,
      message: `Sprint ${sprintId} execution started`,
    });
  } catch (err) {
    console.error("Sprint run error:", err);
    return NextResponse.json({ error: "Failed to start sprint" }, { status: 500 });
  }
}
