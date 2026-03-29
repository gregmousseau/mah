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
      .map((d) => d.name);

    const drafts = sprintDirs
      .map((dir) => {
        const contractPath = join(SPRINTS_DIR, dir, "contract.json");
        if (!existsSync(contractPath)) return null;
        try {
          const contract = JSON.parse(readFileSync(contractPath, "utf-8"));
          return contract;
        } catch {
          return null;
        }
      })
      .filter((c): c is Record<string, unknown> => {
        if (!c) return false;
        const status = c.status as string;
        return status === "draft" || status === "scheduled" || status === "approved";
      })
      .sort((a, b) => {
        const aTime = (a.savedAt || a.createdAt) as string;
        const bTime = (b.savedAt || b.createdAt) as string;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

    return NextResponse.json(drafts);
  } catch (err) {
    console.error("Builder drafts error:", err);
    return NextResponse.json({ error: "Failed to list drafts" }, { status: 500 });
  }
}
