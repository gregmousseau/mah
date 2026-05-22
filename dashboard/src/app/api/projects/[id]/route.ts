import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { primaryRoot, loadAllSprints, loadProjects, resolveMahRoot } from "@/lib/mahRoot";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const root = primaryRoot(process.cwd());
    const projectsDir = join(root, ".mah", "projects");
    const projectFile = join(projectsDir, `${id}.json`);

    if (!existsSync(projectFile)) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const project = JSON.parse(readFileSync(projectFile, "utf-8"));

    // Load sprints from all roots (primary + project-specific)
    const allSprints = loadAllSprints(root);

    const projectSprints = allSprints
      .filter((s) => s.projectId === id)
      .sort((a, b) => {
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    const passedSprints = projectSprints.filter(
      (s) => s.verdict === "pass" || s.status === "passed"
    );
    const passRate = projectSprints.length > 0
      ? Math.round((passedSprints.length / projectSprints.length) * 100)
      : 0;
    const totalCost = projectSprints.reduce((sum, s) => sum + (s.totalCost || 0), 0);
    const avgIterations = projectSprints.length > 0
      ? projectSprints.reduce((sum, s) => sum + (s.iterations || 0), 0) / projectSprints.length
      : 0;

    // Strip internal fields from sprint output
    const sprints = projectSprints.map(({ projectRoot, ...rest }) => rest);

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
