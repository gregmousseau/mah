import { NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  primaryRoot,
  loadProjects,
  loadAllSprints,
  resolveMahRoot,
} from "@/lib/mahRoot";

function projectFilePath(primaryMahRoot: string, projectId: string): string {
  return join(primaryMahRoot, ".mah", "projects", `${projectId}.json`);
}

export async function GET() {
  try {
    const cwd = process.cwd();
    const root = primaryRoot(cwd);
    const projects = loadProjects(root);
    const allSprints = loadAllSprints(root);

    const enriched = projects.map((project) => {
      const projectRoot = resolveMahRoot(project, root);
      const projectSprints = allSprints.filter(
        (s) => s.projectId === project.id || s.projectRoot === projectRoot
      );
      const passedSprints = projectSprints.filter(
        (s) => s.verdict === "pass" || s.status === "passed"
      );
      const passRate = projectSprints.length > 0
        ? (passedSprints.length / projectSprints.length) * 100
        : 0;
      const totalCost = projectSprints.reduce((sum, s) => sum + (s.totalCost || 0), 0);
      const sortedByDate = [...projectSprints]
        .filter((s) => s.createdAt)
        .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

      return {
        ...project,
        sprintCount: projectSprints.length,
        passRate: Math.round(passRate),
        totalCost,
        lastSprintDate: sortedByDate[0]?.createdAt || null,
      };
    });

    enriched.sort(
      (a, b) => (a.createdAt ? new Date(a.createdAt).getTime() : 0) - (b.createdAt ? new Date(b.createdAt).getTime() : 0)
    );

    return NextResponse.json(enriched);
  } catch (err) {
    console.error("Failed to list projects:", err);
    return NextResponse.json({ error: "Failed to list projects" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, name, description, repo, config } = body;

    if (!id || !name) {
      return NextResponse.json({ error: "id and name are required" }, { status: 400 });
    }

    const cwd = process.cwd();
    const root = primaryRoot(cwd);
    const projectsDir = join(root, ".mah", "projects");
    const filePath = projectFilePath(root, id);

    if (existsSync(filePath)) {
      return NextResponse.json({ error: `Project ${id} already exists` }, { status: 409 });
    }

    const project = {
      id,
      name,
      description: description || "",
      repo: repo || "",
      createdAt: new Date().toISOString(),
      config: config || {},
    };

    if (!existsSync(projectsDir)) {
      const { mkdirSync } = await import("fs");
      mkdirSync(projectsDir, { recursive: true });
    }

    const { writeFileSync } = await import("fs");
    writeFileSync(filePath, JSON.stringify(project, null, 2));

    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    console.error("Failed to create project:", err);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
