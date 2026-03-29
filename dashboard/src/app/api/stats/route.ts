import { NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");
const METRICS_DIR = join(MAH_ROOT, ".mah", "metrics");

function isRealSprint(dirName: string, contract: Record<string, unknown> | null): boolean {
  if (!contract) return false;
  // A "real" sprint has a short numeric ID (001, 002, etc.)
  const id = contract.id as string || "";
  if (/^\d{3}$/.test(id)) return true;
  // Or a dir that starts with a 3-digit number
  if (/^\d{3}-/.test(dirName)) return true;
  return false;
}

export async function GET() {
  try {
    if (!existsSync(SPRINTS_DIR)) {
      return NextResponse.json({ totalSprints: 0, passRate: 0, avgIterations: 0, totalCost: 0 });
    }

    const dirs = readdirSync(SPRINTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    let totalSprints = 0;
    let completedSprints = 0;
    let passed = 0;
    let totalIterations = 0;
    let totalCost = 0;
    const costPerSprint: { id: string; name: string; cost: number; date: string }[] = [];

    for (const dir of dirs) {
      const metricsPathOld = join(SPRINTS_DIR, dir, "metrics.json");
      const contractPath = join(SPRINTS_DIR, dir, "contract.json");

      const contract = existsSync(contractPath)
        ? JSON.parse(readFileSync(contractPath, "utf-8"))
        : null;

      // Skip placeholder/test sprints
      if (!isRealSprint(dir, contract)) continue;

      let metrics = null;
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

      if (!metrics) {
        // Running sprint with no metrics yet — count it but don't affect pass rate
        if (contract?.status === "running" || contract?.status === "dev" || contract?.status === "qa") {
          totalSprints++;
        }
        continue;
      }

      totalSprints++;
      completedSprints++;
      if (metrics.verdict === "pass" || metrics.verdict === "conditional") passed++;
      totalIterations += metrics.totals?.iterations || 0;
      totalCost += metrics.totals?.estimatedCost || 0;

      costPerSprint.push({
        id: metrics.sprintId,
        name: metrics.task,
        cost: metrics.totals?.estimatedCost || 0,
        date: contract?.createdAt || metrics.startTime,
      });
    }

    return NextResponse.json({
      totalSprints,
      passRate: completedSprints > 0 ? Math.round((passed / completedSprints) * 100) : 0,
      avgIterations: completedSprints > 0 ? Math.round((totalIterations / completedSprints) * 10) / 10 : 0,
      totalCost: Math.round(totalCost * 100) / 100,
      costPerSprint: costPerSprint.sort((a, b) => a.id.localeCompare(b.id)),
    });
  } catch (err) {
    console.error("Failed to compute stats:", err);
    return NextResponse.json({ error: "Failed to compute stats" }, { status: 500 });
  }
}
