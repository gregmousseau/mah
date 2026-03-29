import { NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync } from "fs";
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

function loadAllSprints() {
  if (!existsSync(SPRINTS_DIR)) return [];

  const sprintDirs = readdirSync(SPRINTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  return sprintDirs
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
    }));
}

export async function GET() {
  try {
    if (!existsSync(PROJECTS_DIR)) {
      return NextResponse.json([]);
    }

    const allSprints = loadAllSprints();

    const projectFiles = readdirSync(PROJECTS_DIR)
      .filter((f) => f.endsWith(".json"));

    const projects = projectFiles.map((file) => {
      const project = JSON.parse(readFileSync(join(PROJECTS_DIR, file), "utf-8"));
      const projectSprints = allSprints.filter((s) => s.projectId === project.id);

      const passedSprints = projectSprints.filter(
        (s) => s.verdict === "pass" || s.status === "passed"
      );
      const passRate = projectSprints.length > 0
        ? (passedSprints.length / projectSprints.length) * 100
        : 0;

      const totalCost = projectSprints.reduce((sum, s) => sum + (s.totalCost || 0), 0);

      const sortedByDate = [...projectSprints]
        .filter((s) => s.createdAt)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return {
        ...project,
        sprintCount: projectSprints.length,
        passRate: Math.round(passRate),
        totalCost,
        lastSprintDate: sortedByDate[0]?.createdAt || null,
      };
    });

    // Sort by createdAt ascending
    projects.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return NextResponse.json(projects);
  } catch (err) {
    console.error("Failed to list projects:", err);
    return NextResponse.json({ error: "Failed to list projects" }, { status: 500 });
  }
}
