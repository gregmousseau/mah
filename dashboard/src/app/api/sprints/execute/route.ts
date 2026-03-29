import { NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { spawn } from "child_process";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");
const EXECUTOR_SCRIPT = join(process.cwd(), "executor.mjs");

export async function POST(request: Request) {
  try {
    const body = await request.json() as { sprintId: string };
    const { sprintId } = body;

    if (!sprintId) {
      return NextResponse.json({ error: "sprintId required" }, { status: 400 });
    }

    if (!existsSync(SPRINTS_DIR)) {
      return NextResponse.json({ error: "No sprints directory" }, { status: 404 });
    }

    // Find the sprint directory
    const dirs = existsSync(SPRINTS_DIR)
      ? (await import("fs")).readdirSync(SPRINTS_DIR, { withFileTypes: true })
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

    const sprintFullPath = join(SPRINTS_DIR, sprintDir);
    const contractPath = join(sprintFullPath, "contract.json");

    if (!existsSync(contractPath)) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    const contract = JSON.parse(readFileSync(contractPath, "utf-8"));

    // Update contract status to running before spawning
    const updatedContract = {
      ...contract,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    writeFileSync(contractPath, JSON.stringify(updatedContract, null, 2));

    // Write initial heartbeat
    const heartbeatPath = join(MAH_ROOT, ".mah", "heartbeat.json");
    const heartbeat = {
      alive: true,
      phase: "starting",
      round: 0,
      elapsed: 0,
      sprintId,
      lastUpdate: new Date().toISOString(),
    };
    writeFileSync(heartbeatPath, JSON.stringify(heartbeat, null, 2));

    // Spawn executor as a detached background process (fire and forget)
    if (!existsSync(EXECUTOR_SCRIPT)) {
      return NextResponse.json(
        { error: `Executor script not found at ${EXECUTOR_SCRIPT}` },
        { status: 500 }
      );
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

    // Log output to a file in the sprint dir for debugging
    const logPath = join(sprintFullPath, "executor.log");
    const logStream = (await import("fs")).createWriteStream(logPath, { flags: "a" });
    child.stdout?.pipe(logStream);
    child.stderr?.pipe(logStream);

    child.unref();

    console.log(`[execute] Spawned executor for sprint ${sprintId} (pid: ${child.pid})`);

    return NextResponse.json({
      status: "started",
      sprintId,
      sprintDir,
      pid: child.pid,
    });
  } catch (err) {
    console.error("Sprint execute error:", err);
    return NextResponse.json({ error: "Failed to start sprint execution" }, { status: 500 });
  }
}
