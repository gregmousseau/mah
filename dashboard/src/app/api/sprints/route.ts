import { NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");
const METRICS_DIR = join(MAH_ROOT, ".mah", "metrics");

function isRealSprint(dirName: string, contract: Record<string, unknown> | null): boolean {
  if (!contract) return false;
  const id = contract.id as string || "";
  const status = contract.status as string || "";
  // Include all lifecycle statuses
  const lifecycleStatuses = ["draft", "planned", "scheduled", "approved", "queued", "running", "passed", "failed", "escalated", "cancelled"];
  if (lifecycleStatuses.includes(status)) return true;
  if (/^\d{3}$/.test(id)) return true;
  if (/^\d{3}-/.test(dirName)) return true;
  return false;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectFilter = searchParams.get("project");

    if (!existsSync(SPRINTS_DIR)) {
      return NextResponse.json([]);
    }

    const sprintDirs = readdirSync(SPRINTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    const sprints = sprintDirs
      .map((dir) => {
        const contractPath = join(SPRINTS_DIR, dir, "contract.json");
        const metricsPathOld = join(SPRINTS_DIR, dir, "metrics.json");

        let contract = null;
        let metrics = null;

        if (existsSync(contractPath)) {
          contract = JSON.parse(readFileSync(contractPath, "utf-8"));
        }

        // Try old location first (sprint-specific)
        if (existsSync(metricsPathOld)) {
          metrics = JSON.parse(readFileSync(metricsPathOld, "utf-8"));
        }
        // Then try new centralized location using sprint ID
        else if (contract?.id) {
          const metricsPathNew = join(METRICS_DIR, `${contract.id}.json`);
          if (existsSync(metricsPathNew)) {
            metrics = JSON.parse(readFileSync(metricsPathNew, "utf-8"));
          }
        }

        return { dir, contract, metrics };
      })
      // Skip placeholder/test sprints
      .filter(({ dir, contract }) => isRealSprint(dir, contract))
      .map(({ contract, metrics }) => {
        const status = contract?.status || "unknown";
        let verdict = metrics?.verdict || (status === "passed" ? "pass" : "unknown");
        // For draft/scheduled/approved, use status as verdict-equivalent
        if (status === "draft" || status === "scheduled" || status === "approved") {
          verdict = status;
        }
        return {
          id: contract?.id || "",
          name: contract?.name || "",
          status,
          verdict,
          iterations: metrics?.totals?.iterations || contract?.iterations?.length || 0,
          totalCost: metrics?.totals?.estimatedCost || 0,
          createdAt: contract?.createdAt || null,
          completedAt: contract?.completedAt || null,
          scheduledFor: contract?.scheduledFor || null,
          projectId: contract?.projectId || null,
          agentConfig: contract?.agentConfig || null,
          sprintType: contract?.sprintType || null,
        };
      })
      // Apply project filter if provided
      .filter((sprint) => !projectFilter || sprint.projectId === projectFilter)
      // Sort by createdAt ascending
      .sort((a, b) => {
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    return NextResponse.json(sprints);
  } catch (err) {
    console.error("Failed to list sprints:", err);
    return NextResponse.json({ error: "Failed to list sprints" }, { status: 500 });
  }
}
