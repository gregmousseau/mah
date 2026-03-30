#!/usr/bin/env node
/**
 * MAH Sprint Executor
 * Standalone Node.js script that runs an existing sprint contract through the pipeline.
 *
 * Usage: node executor.mjs <sprintFullPath>
 *
 * The script runs from the MAH project root (~/clawd/projects/mah).
 * cwd is set to MAH_ROOT by the calling process.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAH_ROOT = process.env.MAH_ROOT ?? resolve(__dirname, "..");

// Global error handlers — ensure sprint gets marked failed on any crash
process.on('uncaughtException', (err) => {
  console.error('[executor] Uncaught exception:', err);
  markFailed(err.message);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[executor] Unhandled rejection:', reason);
  markFailed(String(reason));
  process.exit(1);
});
process.on('SIGTERM', () => {
  console.error('[executor] Received SIGTERM');
  markFailed('Process received SIGTERM');
  process.exit(143);
});

function markFailed(reason) {
  try {
    const p = process.argv[2];
    if (!p) return;
    const cp = join(p, 'contract.json');
    if (!existsSync(cp)) return;
    const c = JSON.parse(readFileSync(cp, 'utf-8'));
    if (c.status === 'passed' || c.status === 'failed') return;
    c.status = 'failed';
    c.failedAt = new Date().toISOString();
    c.failureReason = reason;
    writeFileSync(cp, JSON.stringify(c, null, 2));
    // Clear heartbeat
    const hbPath = join(MAH_ROOT, '.mah', 'heartbeat.json');
    writeFileSync(hbPath, JSON.stringify({ alive: false, lastUpdate: new Date().toISOString(), recoveredBy: 'executor-crash-handler' }, null, 2));
    console.error('[executor] Sprint marked as failed');
  } catch (e) {
    console.error('[executor] Failed to mark sprint:', e);
  }
}

const sprintFullPath = process.argv[2];
const QUEUE_FILE = join(MAH_ROOT, ".mah", "queue", "queue.json");

if (!sprintFullPath) {
  console.error("[executor] Error: sprintFullPath argument required");
  process.exit(1);
}

// Queue helpers
function readQueue() {
  if (!existsSync(QUEUE_FILE)) return { running: null, pending: [], completed: [] };
  try {
    return JSON.parse(readFileSync(QUEUE_FILE, "utf-8"));
  } catch {
    return { running: null, pending: [], completed: [] };
  }
}

function writeQueueFile(state) {
  mkdirSync(join(MAH_ROOT, ".mah", "queue"), { recursive: true });
  writeFileSync(QUEUE_FILE, JSON.stringify(state, null, 2));
}

async function advanceQueue(completedSprintId, completedStatus) {
  const queue = readQueue();

  // Move running -> completed
  if (queue.running && queue.running.sprintId === completedSprintId) {
    queue.completed = [
      {
        sprintId: queue.running.sprintId,
        sprintName: queue.running.sprintName,
        completedAt: new Date().toISOString(),
        status: completedStatus,
      },
      ...queue.completed,
    ].slice(0, 20);
    queue.running = null;
  }

  if (queue.pending.length === 0) {
    writeQueueFile(queue);
    console.log("[executor] Queue empty — no next sprint to start");
    return;
  }

  // Pop next from pending
  const next = queue.pending.shift();
  const nextSprintDirs = existsSync(join(MAH_ROOT, ".mah", "sprints"))
    ? (await import("fs")).readdirSync(join(MAH_ROOT, ".mah", "sprints"), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];

  const nextDirName = nextSprintDirs.find(
    (d) => d.startsWith(next.sprintId) || d.replace(/^0+/, "") === next.sprintId.replace(/^0+/, "")
  );

  if (!nextDirName) {
    console.warn(`[executor] Queue: next sprint dir not found for ${next.sprintId}`);
    writeQueueFile(queue);
    return;
  }

  const nextFullPath = join(MAH_ROOT, ".mah", "sprints", nextDirName);

  // Update contract status
  const nextContractPath = join(nextFullPath, "contract.json");
  if (existsSync(nextContractPath)) {
    const nextContract = JSON.parse(readFileSync(nextContractPath, "utf-8"));
    nextContract.status = "running";
    nextContract.startedAt = new Date().toISOString();
    writeFileSync(nextContractPath, JSON.stringify(nextContract, null, 2));
  }

  // Update heartbeat
  const hbPath = join(MAH_ROOT, ".mah", "heartbeat.json");
  writeFileSync(hbPath, JSON.stringify({
    alive: true,
    phase: "starting",
    round: 0,
    elapsed: 0,
    sprintId: next.sprintId,
    sprintName: next.sprintName,
    lastUpdate: new Date().toISOString(),
  }, null, 2));

  // Spawn next executor
  const child = spawn(
    process.execPath,
    [join(MAH_ROOT, "dashboard", "executor.mjs"), nextFullPath],
    {
      cwd: MAH_ROOT,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: (() => { const e = { ...process.env, MAH_ROOT }; delete e.CLAUDECODE; return e; })(),
    }
  );

  const logStream = (await import("fs")).createWriteStream(join(nextFullPath, "executor.log"), { flags: "a" });
  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);
  child.unref();

  queue.running = {
    sprintId: next.sprintId,
    sprintName: next.sprintName,
    startedAt: new Date().toISOString(),
    pid: child.pid,
  };

  writeQueueFile(queue);
  console.log(`[executor] Queue: started next sprint ${next.sprintId} (pid: ${child.pid})`);
}

if (!existsSync(sprintFullPath)) {
  console.error(`[executor] Error: Sprint directory not found: ${sprintFullPath}`);
  process.exit(1);
}

const contractPath = join(sprintFullPath, "contract.json");
if (!existsSync(contractPath)) {
  console.error(`[executor] Error: Contract not found at ${contractPath}`);
  process.exit(1);
}

// Load contract
const contract = JSON.parse(readFileSync(contractPath, "utf-8"));
console.log(`[executor] Running sprint: ${contract.name} (${contract.id})`);

// Build ProjectConfig from project JSON + sensible defaults
function buildConfig(contract) {
  const projectId = contract.projectId ?? null;
  let projectConfig = {};

  if (projectId) {
    const projectPath = join(MAH_ROOT, ".mah", "projects", `${projectId}.json`);
    if (existsSync(projectPath)) {
      projectConfig = JSON.parse(readFileSync(projectPath, "utf-8"));
      console.log(`[executor] Loaded project config: ${projectPath}`);
    } else {
      console.warn(`[executor] Project config not found: ${projectPath}, using defaults`);
    }
  }

  const repo = projectConfig.repo
    ? resolve(projectConfig.repo.replace("~", process.env.HOME ?? "/home/greg"))
    : MAH_ROOT;

  return {
    project: {
      name: projectConfig.name ?? contract.name ?? "Unnamed Project",
      repo,
    },
    priorities: { speed: 1, quality: 2, cost: 3 },
    agents: {
      generator: {
        type: "openclaw",
        model: "claude-sonnet-4-5",
        cwd: repo,
      },
      evaluator: {
        type: "openclaw",
        model: "claude-sonnet-4-5",
        workspace: repo,
        testUrl: contract.qaBrief?.testUrl ?? "",
      },
    },
    qa: {
      defaultTier: "targeted",
      maxIterations: 3,
    },
    human: {
      notificationChannel: "",
      responseTimeoutMinutes: 30,
      onTimeout: "proceed",
      costThreshold: 40,
    },
    metrics: {
      output: ".mah/metrics/",
    },
    sprints: {
      directory: ".mah/sprints/",
    },
  };
}

async function main() {
  // Set cwd to MAH root so pipeline paths resolve correctly
  process.chdir(MAH_ROOT);
  console.log(`[executor] Working directory: ${process.cwd()}`);

  // Import compiled pipeline
  const pipelinePath = join(MAH_ROOT, "dist", "pipeline.js");
  if (!existsSync(pipelinePath)) {
    console.error(`[executor] Pipeline not found at ${pipelinePath}`);
    console.error("[executor] Run: cd ~/clawd/projects/mah && npx tsc");
    process.exit(1);
  }

  const { runExistingContract } = await import(pipelinePath);
  if (!runExistingContract) {
    console.error("[executor] runExistingContract not exported from pipeline.js");
    process.exit(1);
  }

  // Import EventLogger
  const eventsPath = join(MAH_ROOT, "dist", "events.js");
  const { EventLogger } = await import(eventsPath);

  const config = buildConfig(contract);
  const eventsDir = join(MAH_ROOT, ".mah", "events");
  mkdirSync(eventsDir, { recursive: true });
  const events = new EventLogger(eventsDir);

  console.log(`[executor] Starting pipeline for sprint ${contract.id}...`);

  // Auto-retry: if the pipeline crashes (EPIPE, timeout, etc.), retry from where it left off
  const MAX_RETRIES = 2;
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    attempt++;
    try {
      // Re-read contract on retry (may have been updated by previous partial run)
      const currentContract = attempt > 1
        ? JSON.parse(readFileSync(contractPath, "utf-8"))
        : contract;

      if (attempt > 1) {
        console.log(`[executor] Retry ${attempt - 1}/${MAX_RETRIES} for sprint ${currentContract.id} (resuming from transcript)`);
        currentContract.status = "dev"; // Reset status for pipeline
        currentContract.iterations = []; // Pipeline rebuilds from transcript
        writeFileSync(contractPath, JSON.stringify(currentContract, null, 2));
      }

      const { contract: finalContract, metrics } = await runExistingContract(
        currentContract,
        config,
        events,
        sprintFullPath
      );

      console.log(`[executor] Sprint ${finalContract.id} completed: ${finalContract.status}`);
      console.log(`[executor] Duration: ${metrics.totals.durationMs}ms`);
      console.log(`[executor] Cost: $${metrics.totals.estimatedCost.toFixed(4)}`);

      // Advance queue: start next pending sprint if any
      await advanceQueue(finalContract.id, finalContract.status);

      process.exit(0);
    } catch (err) {
      const errStr = String(err);
      const isRetryable = ['EPIPE', 'SIGTERM', 'timed out', 'ECONNRESET'].some(s => errStr.includes(s));

      if (isRetryable && attempt <= MAX_RETRIES) {
        console.error(`[executor] Retryable error on attempt ${attempt}: ${errStr}`);
        console.log(`[executor] Waiting 10s before retry...`);
        await new Promise(r => setTimeout(r, 10_000));
        continue;
      }

      console.error("[executor] Pipeline error (no more retries):", err);

      // Update contract status to failed
      try {
        const currentContract = JSON.parse(readFileSync(contractPath, "utf-8"));
        const sprintId = currentContract.id;
        currentContract.status = "failed";
        currentContract.failedAt = new Date().toISOString();
        currentContract.failureReason = errStr;
        currentContract.retryAttempts = attempt;
        writeFileSync(contractPath, JSON.stringify(currentContract, null, 2));

        // Advance queue even on failure
        await advanceQueue(sprintId, "failed").catch((e) =>
          console.error("[executor] Queue advance error:", e)
        );
      } catch (writeErr) {
        console.error("[executor] Failed to update contract status:", writeErr);
      }

      process.exit(1);
    }
  }
}

main();
