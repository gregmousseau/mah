import { NextResponse } from "next/server";
import {
  primaryRoot,
  loadAllSprints,
  loadProjects,
  resolveMahRoot,
} from "@/lib/mahRoot";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectFilter = searchParams.get("project");

    const root = primaryRoot(process.cwd());
    const allSprints = loadAllSprints(root);

    // Build root → projectId map for resolving projects by sprint source root
    const projects = loadProjects(root);
    const rootToProjectId = new Map<string, string>();
    const projectRootMap = new Map<string, string>();
    for (const p of projects) {
      const pRoot = resolveMahRoot(p, root);
      rootToProjectId.set(pRoot, p.id);
      projectRootMap.set(p.id, pRoot);
    }

    // Resolve each sprint to a project ID (via projectId or source root)
    const resolved = allSprints.map((sprint) => {
      const resolvedProjectId = sprint.projectId || rootToProjectId.get(sprint.projectRoot) || null;
      return { ...sprint, resolvedProjectId };
    });

    const filtered = resolved
      .filter((sprint) => {
        if (!projectFilter) return true;
        if (sprint.resolvedProjectId === projectFilter) return true;
        // Fallback: match by root
        const filterRoot = projectRootMap.get(projectFilter);
        return filterRoot && sprint.projectRoot === filterRoot;
      })
      .sort((a, b) => {
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    return NextResponse.json(filtered);
  } catch (err) {
    console.error("Failed to list sprints:", err);
    return NextResponse.json({ error: "Failed to list sprints" }, { status: 500 });
  }
}
