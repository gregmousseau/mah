import { NextResponse } from "next/server";
import { primaryRoot, loadAllSprints } from "@/lib/mahRoot";

export async function GET() {
  try {
    const root = primaryRoot(process.cwd());
    const allSprints = loadAllSprints(root);

    let totalSprints = 0;
    let completedSprints = 0;
    let passed = 0;
    let totalIterations = 0;
    let totalCost = 0;
    const costPerSprint: { id: string; name: string; cost: number; date: string }[] = [];

    for (const sprint of allSprints) {
      const status = sprint.status;
      const isActive = ["running", "dev", "qa", "queued"].includes(status);

      if (!isActive && sprint.verdict === "unknown" && sprint.iterations === 0) {
        continue; // skip non-active sprints with no data
      }

      totalSprints++;

      if (sprint.verdict !== "unknown") {
        completedSprints++;
        if (sprint.verdict === "pass" || sprint.verdict === "conditional") passed++;
        totalIterations += sprint.iterations;
        totalCost += sprint.totalCost;

        costPerSprint.push({
          id: sprint.id,
          name: sprint.name,
          cost: sprint.totalCost,
          date: sprint.createdAt || "",
        });
      }
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
