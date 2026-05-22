import { NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  primaryRoot,
  loadAllSprints,
  isRealSprint,
} from "@/lib/mahRoot";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectFilter = searchParams.get("project");

    const root = primaryRoot(process.cwd());
    const allSprints = loadAllSprints(root);

    const filtered = allSprints
      .filter((sprint) => !projectFilter || sprint.projectId === projectFilter)
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
