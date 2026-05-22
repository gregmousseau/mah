import { NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  primaryRoot,
  loadAllSprints,
  isRealSprint,
  loadProjects,
  resolveMahRoot,
} from "@/lib/mahRoot";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectFilter = searchParams.get("project");

    const root = primaryRoot(process.cwd());
    const allSprints = loadAllSprints(root);

    // Build root map for project filtering
    const projects = loadProjects(root);
    const projectRootMap = new Map<string, string>();
    for (const p of projects) {
      projectRootMap.set(p.id, resolveMahRoot(p, root));
    }

    const filtered = allSprints
      .filter((sprint) => {
        if (!projectFilter) return true;
        if (sprint.projectId === projectFilter) return true;
        // Match by root if projectFilter resolves to a known root
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
