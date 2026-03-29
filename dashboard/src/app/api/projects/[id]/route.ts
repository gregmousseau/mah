import { NextResponse } from "next/server";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const PROJECTS_DIR = join(MAH_ROOT, ".mah", "projects");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");

function isRealSprint(dirName: string, contract: Record<string, unknown> | null): boolean {
  if (!contract) return false;
  const id = contract.id as string || "";
  if (/^\d{3}$/.test(id)) return true;
  if (/^\d{3}-/.test(dirName)) return true;
  return false;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectFile = join(PROJECTS_DIR, `${id}.json`);

    if (!existsSync(projectFile)) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const project = JSON.parse(readFileSync(projectFile, "utf-8"));

    // Load sprints for this project
    const sprintDirs = existsSync(SPRINTS_DIR)
      ? readdirSync(SPRINTS_DIR, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      : [];

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
      .filter(({ dir, contract }) => isRealSprint(dir, contract))
      .filter(({ contract }) => contract?.projectId === id)
      .map(({ contract, metrics }) => ({
        id: contract?.id || "",
        name: contract?.name || "",
        status: contract?.status || "unknown",
        verdict: metrics?.verdict || (contract?.status === "passed" ? "pass" : "unknown"),
        iterations: metrics?.totals?.iterations || contract?.iterations?.length || 0,
        totalCost: metrics?.totals?.estimatedCost || 0,
        createdAt: contract?.createdAt || null,
        completedAt: contract?.completedAt || null,
        projectId: contract?.projectId || null,
      }))
      .sort((a, b) => {
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    const passedSprints = sprints.filter(
      (s) => s.verdict === "pass" || s.status === "passed"
    );
    const passRate = sprints.length > 0
      ? Math.round((passedSprints.length / sprints.length) * 100)
      : 0;
    const totalCost = sprints.reduce((sum, s) => sum + (s.totalCost || 0), 0);
    const avgIterations = sprints.length > 0
      ? sprints.reduce((sum, s) => sum + (s.iterations || 0), 0) / sprints.length
      : 0;

    return NextResponse.json({
      ...project,
      sprints,
      stats: {
        sprintCount: sprints.length,
        passRate,
        totalCost,
        avgIterations: Math.round(avgIterations * 10) / 10,
      },
    });
  } catch (err) {
    console.error("Failed to load project:", err);
    return NextResponse.json({ error: "Failed to load project" }, { status: 500 });
  }
}
