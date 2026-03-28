import { NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");

export async function GET() {
  try {
    if (!existsSync(SPRINTS_DIR)) {
      return NextResponse.json({ totalSprints: 0, passRate: 0, avgIterations: 0, totalCost: 0 });
    }

    const dirs = readdirSync(SPRINTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    let totalSprints = 0;
    let passed = 0;
    let totalIterations = 0;
    let totalCost = 0;
    const costPerSprint: { id: string; name: string; cost: number; date: string }[] = [];

    for (const dir of dirs) {
      const metricsPath = join(SPRINTS_DIR, dir, "metrics.json");
      const contractPath = join(SPRINTS_DIR, dir, "contract.json");

      if (!existsSync(metricsPath)) continue;

      const metrics = JSON.parse(readFileSync(metricsPath, "utf-8"));
      const contract = existsSync(contractPath)
        ? JSON.parse(readFileSync(contractPath, "utf-8"))
        : null;

      totalSprints++;
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
      passRate: totalSprints > 0 ? Math.round((passed / totalSprints) * 100) : 0,
      avgIterations: totalSprints > 0 ? Math.round((totalIterations / totalSprints) * 10) / 10 : 0,
      totalCost: Math.round(totalCost * 100) / 100,
      costPerSprint: costPerSprint.sort((a, b) => a.id.localeCompare(b.id)),
    });
  } catch (err) {
    console.error("Failed to compute stats:", err);
    return NextResponse.json({ error: "Failed to compute stats" }, { status: 500 });
  }
}
