import { NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");

function isRealSprint(dirName: string, contract: Record<string, unknown> | null): boolean {
  if (!contract) return false;
  const id = contract.id as string || "";
  if (/^\d{3}$/.test(id)) return true;
  if (/^\d{3}-/.test(dirName)) return true;
  return false;
}

export async function GET() {
  try {
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
        const metricsPath = join(SPRINTS_DIR, dir, "metrics.json");

        let contract = null;
        let metrics = null;

        if (existsSync(contractPath)) {
          contract = JSON.parse(readFileSync(contractPath, "utf-8"));
        }
        if (existsSync(metricsPath)) {
          metrics = JSON.parse(readFileSync(metricsPath, "utf-8"));
        }

        return { dir, contract, metrics };
      })
      // Skip placeholder/test sprints
      .filter(({ dir, contract }) => isRealSprint(dir, contract))
      .map(({ contract, metrics }) => ({
        id: contract?.id || "",
        name: contract?.name || "",
        status: contract?.status || "unknown",
        verdict: metrics?.verdict || (contract?.status === "passed" ? "pass" : "unknown"),
        iterations: metrics?.totals?.iterations || contract?.iterations?.length || 0,
        totalCost: metrics?.totals?.estimatedCost || 0,
        createdAt: contract?.createdAt || null,
        completedAt: contract?.completedAt || null,
      }))
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
