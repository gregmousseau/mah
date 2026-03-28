import { NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");

export async function GET() {
  try {
    if (!existsSync(SPRINTS_DIR)) {
      return NextResponse.json([]);
    }

    const sprintDirs = readdirSync(SPRINTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    const sprints = sprintDirs.map((dir) => {
      const contractPath = join(SPRINTS_DIR, dir, "contract.json");
      const metricsPath = join(SPRINTS_DIR, dir, "metrics.json");

      let contract = null;
      let metrics = null;

      if (existsSync(contractPath)) {
        contract = JSON.parse(readFileSync(contractPath, "utf-8"));
      }
      if (existsSync(metricsPath)) {
        metrics = JSON.parse(readFileSync(metricsPath, "utf-8"));
      }

      return {
        id: contract?.id || dir,
        name: contract?.name || dir,
        status: contract?.status || "unknown",
        verdict: metrics?.verdict || "unknown",
        iterations: metrics?.totals?.iterations || 0,
        totalCost: metrics?.totals?.estimatedCost || 0,
        createdAt: contract?.createdAt || null,
        completedAt: contract?.completedAt || null,
      };
    });

    return NextResponse.json(sprints);
  } catch (err) {
    console.error("Failed to list sprints:", err);
    return NextResponse.json({ error: "Failed to list sprints" }, { status: 500 });
  }
}
