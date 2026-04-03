import { NextResponse } from "next/server";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const MAH_ROOT = resolve(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");

interface DemoSprint {
  id: string;
  name: string;
  task: string;
  status: string;
  sprintType?: string;
  agentConfig?: {
    generator: { agentId: string; agentName: string };
    evaluator: { agentId: string; agentName: string };
  };
  agentAssignments?: unknown[];
  iterations: number;
  rounds: {
    round: number;
    phase: string;
    actor: string;
    model: string;
    durationMs: number;
    outputPreview: string;
    defectCount?: number;
    verdict?: string;
  }[];
  metrics?: {
    totalDurationMs: number;
    estimatedCost: number;
    defectsFound: number;
    defectsFixed: number;
  };
  createdAt: string;
  completedAt?: string;
}

/**
 * GET /api/demo — returns curated sprint data for the demo replay page.
 * No auth needed. Read-only. Pre-recorded data.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sprintId = url.searchParams.get("id");

  try {
    if (sprintId) {
      // Return single sprint with full transcript
      const sprint = loadSprint(sprintId);
      if (!sprint) {
        return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
      }
      return NextResponse.json(sprint);
    }

    // Return list of all sprints (summary only)
    const sprints = loadAllSprintSummaries();
    return NextResponse.json({ sprints, total: sprints.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

function loadAllSprintSummaries(): { id: string; name: string; status: string; iterations: number; cost: number; createdAt: string; sprintType?: string; agentName?: string }[] {
  if (!existsSync(SPRINTS_DIR)) return [];

  const dirs = readdirSync(SPRINTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

  const summaries: ReturnType<typeof loadAllSprintSummaries> = [];

  for (const dir of dirs) {
    const contractPath = join(SPRINTS_DIR, dir, "contract.json");
    if (!existsSync(contractPath)) continue;

    try {
      const contract = JSON.parse(readFileSync(contractPath, "utf-8"));
      const metricsPath = join(SPRINTS_DIR, dir, "metrics.json");
      let cost = 0;
      if (existsSync(metricsPath)) {
        const metrics = JSON.parse(readFileSync(metricsPath, "utf-8"));
        cost = metrics.totals?.estimatedCost ?? 0;
      }

      summaries.push({
        id: dir,
        name: contract.name ?? dir,
        status: contract.status ?? "unknown",
        iterations: contract.iterations?.length ?? 0,
        cost,
        createdAt: contract.createdAt ?? "",
        sprintType: contract.sprintType,
        agentName: contract.agentConfig?.generator?.agentName,
      });
    } catch { /* skip */ }
  }

  return summaries;
}

function loadSprint(sprintId: string): DemoSprint | null {
  // Find directory matching the ID
  if (!existsSync(SPRINTS_DIR)) return null;

  const dirs = readdirSync(SPRINTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const dir = dirs.find(d => d === sprintId || d.includes(sprintId));
  if (!dir) return null;

  const sprintDir = join(SPRINTS_DIR, dir);
  const contractPath = join(sprintDir, "contract.json");
  if (!existsSync(contractPath)) return null;

  const contract = JSON.parse(readFileSync(contractPath, "utf-8"));

  // Build rounds from transcript if available
  const rounds: DemoSprint["rounds"] = [];
  const transcriptPath = join(sprintDir, "transcript.json");
  if (existsSync(transcriptPath)) {
    const transcript = JSON.parse(readFileSync(transcriptPath, "utf-8"));
    for (const phase of (transcript.phases ?? [])) {
      const output = phase.responseReceived ?? "";
      rounds.push({
        round: phase.round,
        phase: phase.phase,
        actor: phase.actor,
        model: phase.model,
        durationMs: new Date(phase.endTime).getTime() - new Date(phase.startTime).getTime(),
        outputPreview: output.slice(0, 2000),
        defectCount: phase.phase === "qa" ? (output.match(/P[0-3]-\d+/g) ?? []).length : undefined,
        verdict: phase.phase === "qa" ? (output.match(/Verdict:\s*(.+)/i)?.[1]?.trim() ?? undefined) : undefined,
      });
    }
  }

  // Load metrics
  let metrics: DemoSprint["metrics"];
  const metricsPath = join(sprintDir, "metrics.json");
  if (existsSync(metricsPath)) {
    const m = JSON.parse(readFileSync(metricsPath, "utf-8"));
    const df = m.quality?.defectsFound ?? {};
    const dx = m.quality?.defectsFixed ?? {};
    metrics = {
      totalDurationMs: m.totals?.durationMs ?? 0,
      estimatedCost: m.totals?.estimatedCost ?? 0,
      defectsFound: (df.p0 ?? 0) + (df.p1 ?? 0) + (df.p2 ?? 0) + (df.p3 ?? 0),
      defectsFixed: (dx.p0 ?? 0) + (dx.p1 ?? 0) + (dx.p2 ?? 0) + (dx.p3 ?? 0),
    };
  }

  return {
    id: dir,
    name: contract.name ?? dir,
    task: contract.task ?? "",
    status: contract.status ?? "unknown",
    sprintType: contract.sprintType,
    agentConfig: contract.agentConfig,
    agentAssignments: contract.agentAssignments,
    iterations: contract.iterations?.length ?? 0,
    rounds,
    metrics,
    createdAt: contract.createdAt ?? "",
    completedAt: contract.completedAt,
  };
}
