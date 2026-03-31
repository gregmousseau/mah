import { NextResponse } from "next/server";
import { existsSync, readdirSync, rmSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");

function findSprintDir(sprintId: string): string | null {
  if (!existsSync(SPRINTS_DIR)) return null;
  const dirs = readdirSync(SPRINTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const found = dirs.find((d) => d === sprintId || d.startsWith(sprintId));
  return found ? join(SPRINTS_DIR, found) : null;
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sprintId } = await params;

    if (!sprintId || !sprintId.trim()) {
      return NextResponse.json({ error: "Sprint ID is required" }, { status: 400 });
    }

    // Find the sprint directory
    const sprintDir = findSprintDir(sprintId);
    if (!sprintDir) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }

    // Delete the entire sprint directory
    rmSync(sprintDir, { recursive: true, force: true });

    return NextResponse.json({ success: true, message: "Draft deleted successfully" });
  } catch (err) {
    console.error("Board delete-draft error:", err);
    return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
  }
}
