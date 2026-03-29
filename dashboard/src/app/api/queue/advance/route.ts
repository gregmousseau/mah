import { NextResponse } from "next/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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

function findSprintDir(sprintId: string): string | null {
  if (!existsSync(SPRINTS_DIR)) return null;
  const { readdirSync } = require("fs");
  const dirs: string[] = readdirSync(SPRINTS_DIR, { withFileTypes: true })
    .filter((d: { isDirectory: () => boolean }) => d.isDirectory())
    .map((d: { name: string }) => d.name);
  return dirs.find((d) => d.startsWith(sprintId) || d.replace(/^0+/, "") === sprintId.replace(/^0+/, "")) ?? null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { sprintId, status = "completed" } = body as { sprintId?: string; status?: string };

    const queue = readQueue();

    // Move running -> completed
    if (queue.running) {
      const completedEntry: QueueCompleted = {
        sprintId: queue.running.sprintId,
        sprintName: queue.running.sprintName,
        completedAt: new Date().toISOString(),
        status,
      };
      // Keep only last 20 completed
      queue.completed = [completedEntry, ...queue.completed].slice(0, 20);
      queue.running = null;
    }

    // Start next pending if any
    if (queue.pending.length > 0) {
      const next = queue.pending.shift()!;

      // Find the sprint directory
      const sprintDirName = findSprintDir(next.sprintId);
      if (!sprintDirName) {
        console.warn(`[queue/advance] Sprint dir not found for ${next.sprintId}`);
        writeQueue(queue);
        return NextResponse.json({ status: "no_sprint_dir", sprintId: next.sprintId });
      }

      const sprintFullPath = join(SPRINTS_DIR, sprintDirName);

      // Update contract status to running
      const contractPath = join(sprintFullPath, "contract.json");
      if (existsSync(contractPath)) {
        const contract = JSON.parse(readFileSync(contractPath, "utf-8"));
        contract.status = "running";
        contract.startedAt = new Date().toISOString();
        writeFileSync(contractPath, JSON.stringify(contract, null, 2));
      }

      // Write heartbeat
      const heartbeatPath = join(MAH_ROOT, ".mah", "heartbeat.json");
      writeFileSync(heartbeatPath, JSON.stringify({
        alive: true,
        phase: "starting",
        round: 0,
        elapsed: 0,
        sprintId: next.sprintId,
        sprintName: next.sprintName,
        lastUpdate: new Date().toISOString(),
      }, null, 2));

      // Spawn executor
      let pid: number | undefined;
      if (existsSync(EXECUTOR_SCRIPT)) {
        const child = spawn(
          process.execPath,
          [EXECUTOR_SCRIPT, sprintFullPath],
          {
            cwd: MAH_ROOT,
            detached: true,
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, MAH_ROOT },
          }
        );
        const logPath = join(sprintFullPath, "executor.log");
        const { createWriteStream } = require("fs");
        const logStream = createWriteStream(logPath, { flags: "a" });
        child.stdout?.pipe(logStream);
        child.stderr?.pipe(logStream);
        child.unref();
        pid = child.pid;
      }

      queue.running = {
        sprintId: next.sprintId,
        sprintName: next.sprintName,
        startedAt: new Date().toISOString(),
        pid,
      };

      writeQueue(queue);

      return NextResponse.json({
        status: "started",
        sprintId: next.sprintId,
        pid,
      });
    }

    writeQueue(queue);
    return NextResponse.json({ status: "idle", message: "Queue is empty" });
  } catch (err) {
    console.error("Queue advance error:", err);
    return NextResponse.json({ error: "Failed to advance queue" }, { status: 500 });
  }
}
