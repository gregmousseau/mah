import { NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    if (!existsSync(SPRINTS_DIR)) {
      return NextResponse.json(null);
    }

    // Find dir matching the id prefix
    const dirs = readdirSync(SPRINTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const sprintDir = dirs.find(
      (d) => d.startsWith(id) || d.replace(/^0+/, "") === id.replace(/^0+/, "")
    );

    if (!sprintDir) {
      return NextResponse.json(null);
    }

    const transcriptPath = join(SPRINTS_DIR, sprintDir, "transcript.json");

    if (!existsSync(transcriptPath)) {
      return NextResponse.json(null);
    }

    const transcript = JSON.parse(readFileSync(transcriptPath, "utf-8"));
    return NextResponse.json(transcript);
  } catch (err) {
    console.error("Failed to load transcript:", err);
    return NextResponse.json(null);
  }
}
