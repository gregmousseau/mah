import { NextResponse } from "next/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const QUEUE_DIR = join(MAH_ROOT, ".mah", "queue");
const QUEUE_FILE = join(QUEUE_DIR, "queue.json");

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

export function readQueue(): QueueState {
  if (!existsSync(QUEUE_FILE)) {
    return { running: null, pending: [], completed: [] };
  }
  try {
    return JSON.parse(readFileSync(QUEUE_FILE, "utf-8"));
  } catch {
    return { running: null, pending: [], completed: [] };
  }
}

export function writeQueue(state: QueueState): void {
  mkdirSync(QUEUE_DIR, { recursive: true });
  writeFileSync(QUEUE_FILE, JSON.stringify(state, null, 2));
}

export async function GET() {
  try {
    const queue = readQueue();
    return NextResponse.json(queue);
  } catch (err) {
    console.error("Queue GET error:", err);
    return NextResponse.json({ error: "Failed to read queue" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sprintId, sprintName } = body as { sprintId: string; sprintName?: string };

    if (!sprintId) {
      return NextResponse.json({ error: "sprintId required" }, { status: 400 });
    }

    const queue = readQueue();

    // Check if already in queue
    if (queue.running?.sprintId === sprintId) {
      return NextResponse.json({ status: "already_running", position: 0 });
    }
    const existingIdx = queue.pending.findIndex((p) => p.sprintId === sprintId);
    if (existingIdx >= 0) {
      return NextResponse.json({ status: "already_queued", position: existingIdx + 1 });
    }

    queue.pending.push({
      sprintId,
      sprintName,
      queuedAt: new Date().toISOString(),
    });

    writeQueue(queue);

    return NextResponse.json({
      status: "queued",
      position: queue.pending.length,
    });
  } catch (err) {
    console.error("Queue POST error:", err);
    return NextResponse.json({ error: "Failed to add to queue" }, { status: 500 });
  }
}
