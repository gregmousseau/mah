import { NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");
const METRICS_DIR = join(MAH_ROOT, ".mah", "metrics");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    if (!existsSync(SPRINTS_DIR)) {
      return NextResponse.json({ error: "No sprints directory" }, { status: 404 });
    }

    // Find dir matching the id prefix
    const dirs = readdirSync(SPRINTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const sprintDir = dirs.find(
      (d) => d.startsWith(id) || d.replace(/^0+/, "") === id.replace(/^0+/, "")
    );

    if (!sprintDir) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }

    const contractPath = join(SPRINTS_DIR, sprintDir, "contract.json");
    const metricsPathOld = join(SPRINTS_DIR, sprintDir, "metrics.json");

    const contract = existsSync(contractPath)
      ? JSON.parse(readFileSync(contractPath, "utf-8"))
      : null;

    let metrics = null;
    // Try old location first (sprint-specific)
    if (existsSync(metricsPathOld)) {
      metrics = JSON.parse(readFileSync(metricsPathOld, "utf-8"));
    }
    // Then try new centralized location using sprint ID
    else if (contract?.id) {
      const metricsPathNew = join(METRICS_DIR, `${contract.id}.json`);
      if (existsSync(metricsPathNew)) {
        metrics = JSON.parse(readFileSync(metricsPathNew, "utf-8"));
      }
    }

    return NextResponse.json({ contract, metrics });
  } catch (err) {
    console.error("Failed to load sprint:", err);
    return NextResponse.json({ error: "Failed to load sprint" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    if (!existsSync(SPRINTS_DIR)) {
      return NextResponse.json({ error: "No sprints directory" }, { status: 404 });
    }

    const dirs = readdirSync(SPRINTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const sprintDir = dirs.find(
      (d) => d.startsWith(id) || d.replace(/^0+/, "") === id.replace(/^0+/, "")
    );

    if (!sprintDir) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }

    rmSync(join(SPRINTS_DIR, sprintDir), { recursive: true, force: true });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("Failed to delete sprint:", err);
    return NextResponse.json({ error: "Failed to delete sprint" }, { status: 500 });
  }
}
