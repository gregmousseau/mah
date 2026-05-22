import { NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { primaryRoot, findSprint } from "@/lib/mahRoot";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sprintId } = await params;
    const root = primaryRoot(process.cwd());

    const result = findSprint(sprintId, root);

    if (!result) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }

    // Also load transcript if it exists
    const sprintsDir = join(result.root, ".mah", "sprints");
    const dirs = readdirSync(sprintsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    let transcript = null;
    for (const dir of dirs) {
      const contractPath = join(sprintsDir, dir, "contract.json");
      if (!existsSync(contractPath)) continue;
      const contract = JSON.parse(readFileSync(contractPath, "utf-8"));
      if (contract.id === sprintId) {
        const transcriptPath = join(sprintsDir, dir, "transcript.json");
        if (existsSync(transcriptPath)) {
          transcript = JSON.parse(readFileSync(transcriptPath, "utf-8"));
        }
        break;
      }
    }

    return NextResponse.json({
      contract: result.contract,
      metrics: result.metrics,
      transcript,
      projectRoot: result.root,
    });
  } catch (err) {
    console.error("Failed to load sprint:", err);
    return NextResponse.json({ error: "Failed to load sprint" }, { status: 500 });
  }
}
