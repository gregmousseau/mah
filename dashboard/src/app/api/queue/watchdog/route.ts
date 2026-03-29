import { NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const HEARTBEAT_PATH = join(MAH_ROOT, ".mah", "heartbeat.json");
const QUEUE_PATH = join(MAH_ROOT, ".mah", "queue", "queue.json");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes without heartbeat update = stuck

interface Heartbeat {
  alive: boolean;
  phase?: string;
  round?: number;
  elapsed?: number;
  lastUpdate: string;
  sprintId?: string;
  sprintName?: string;
}

interface QueueState {
  running: { sprintId: string; startedAt: string; pid: number } | null;
  pending: Array<{ sprintId: string; queuedAt: string }>;
  completed: Array<{ sprintId: string; completedAt: string; status: string }>;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /api/queue/watchdog
 * Checks for stuck sprints and auto-recovers:
 * - If heartbeat.alive but lastUpdate > 10 min ago → stuck
 * - If queue.running but executor PID is dead → stuck
 * - On stuck: mark sprint failed, clear heartbeat, advance queue
 */
export async function GET() {
  try {
    const issues: string[] = [];
    let recovered = false;

    // Read heartbeat
    let heartbeat: Heartbeat | null = null;
    if (existsSync(HEARTBEAT_PATH)) {
      heartbeat = JSON.parse(readFileSync(HEARTBEAT_PATH, "utf-8"));
    }

    // Read queue
    let queue: QueueState | null = null;
    if (existsSync(QUEUE_PATH)) {
      queue = JSON.parse(readFileSync(QUEUE_PATH, "utf-8"));
    }

    // Check 1: Heartbeat says alive but stale
    if (heartbeat?.alive && heartbeat.lastUpdate) {
      const age = Date.now() - new Date(heartbeat.lastUpdate).getTime();
      if (age > STALE_THRESHOLD_MS) {
        issues.push(`Heartbeat stale: last update ${Math.round(age / 60000)}m ago`);

        // Mark sprint as failed
        const sprintId = heartbeat.sprintId ?? queue?.running?.sprintId;
        if (sprintId) {
          markSprintFailed(sprintId, "Watchdog: heartbeat stale (executor likely crashed)");
        }

        // Clear heartbeat
        writeFileSync(HEARTBEAT_PATH, JSON.stringify({
          alive: false,
          lastUpdate: new Date().toISOString(),
          recoveredBy: "watchdog",
        }, null, 2));

        // Clear queue running
        if (queue?.running) {
          queue.completed.push({
            sprintId: queue.running.sprintId,
            completedAt: new Date().toISOString(),
            status: "failed",
          });
          queue.running = null;
          writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
        }

        recovered = true;
      }
    }

    // Check 2: Queue says running but PID is dead
    if (queue?.running && !recovered) {
      if (!isProcessAlive(queue.running.pid)) {
        const age = Date.now() - new Date(queue.running.startedAt).getTime();
        if (age > 60_000) { // Only if started > 1 min ago (give it time to boot)
          issues.push(`Executor PID ${queue.running.pid} is dead`);

          markSprintFailed(queue.running.sprintId, "Watchdog: executor process not found");

          // Clear heartbeat
          if (heartbeat?.alive) {
            writeFileSync(HEARTBEAT_PATH, JSON.stringify({
              alive: false,
              lastUpdate: new Date().toISOString(),
              recoveredBy: "watchdog",
            }, null, 2));
          }

          // Move to completed, advance queue
          queue.completed.push({
            sprintId: queue.running.sprintId,
            completedAt: new Date().toISOString(),
            status: "failed",
          });
          queue.running = null;
          writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));

          recovered = true;
        }
      }
    }

    // If we recovered and there are pending sprints, trigger advance
    if (recovered && queue?.pending && queue.pending.length > 0) {
      // Call advance endpoint
      try {
        const baseUrl = `http://localhost:${process.env.PORT ?? 3333}`;
        await fetch(`${baseUrl}/api/queue/advance`, { method: "POST" });
        issues.push("Advanced queue to next pending sprint");
      } catch {
        issues.push("Failed to advance queue (advance endpoint unreachable)");
      }
    }

    return NextResponse.json({
      healthy: issues.length === 0,
      recovered,
      issues,
      heartbeat: heartbeat ? {
        alive: heartbeat.alive,
        ageMs: heartbeat.lastUpdate ? Date.now() - new Date(heartbeat.lastUpdate).getTime() : null,
        sprintId: heartbeat.sprintId,
      } : null,
      queue: queue ? {
        running: queue.running?.sprintId ?? null,
        pending: queue.pending.length,
      } : null,
    });
  } catch (err) {
    console.error("Watchdog error:", err);
    return NextResponse.json({ healthy: false, error: String(err) }, { status: 500 });
  }
}

function markSprintFailed(sprintId: string, reason: string): void {
  try {
    const dirs = require("fs").readdirSync(SPRINTS_DIR, { withFileTypes: true })
      .filter((d: { isDirectory: () => boolean }) => d.isDirectory())
      .map((d: { name: string }) => d.name);

    const dir = dirs.find((d: string) =>
      d.startsWith(sprintId) || d.replace(/^0+/, "") === sprintId.replace(/^0+/, "")
    );

    if (!dir) return;

    const contractPath = join(SPRINTS_DIR, dir, "contract.json");
    if (!existsSync(contractPath)) return;

    const contract = JSON.parse(readFileSync(contractPath, "utf-8"));
    if (contract.status === "passed" || contract.status === "failed") return; // Already terminal

    contract.status = "failed";
    contract.failedAt = new Date().toISOString();
    contract.failureReason = reason;
    writeFileSync(contractPath, JSON.stringify(contract, null, 2));
  } catch (err) {
    console.error(`Watchdog: failed to mark sprint ${sprintId} as failed:`, err);
  }
}
