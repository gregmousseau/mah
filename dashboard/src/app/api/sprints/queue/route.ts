import { NextResponse } from "next/server";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");

export async function GET() {
  try {
    if (!existsSync(SPRINTS_DIR)) {
      return NextResponse.json([]);
    }

    const dirs = readdirSync(SPRINTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    const queuedSprints = dirs
      .map((dir) => {
        const contractPath = join(SPRINTS_DIR, dir, "contract.json");
        if (!existsSync(contractPath)) return null;
        try {
          const contract = JSON.parse(readFileSync(contractPath, "utf-8"));
          if (contract.status === "queued" || contract.status === "running") {
            return {
              id: contract.id,
              name: contract.name,
              status: contract.status,
              queuedAt: contract.queuedAt,
              createdAt: contract.createdAt,
            };
          }
          return null;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        const ta = a?.queuedAt || a?.createdAt || "";
        const tb = b?.queuedAt || b?.createdAt || "";
        return new Date(ta).getTime() - new Date(tb).getTime();
      });

    return NextResponse.json(queuedSprints);
  } catch (err) {
    console.error("Queue list error:", err);
    return NextResponse.json({ error: "Failed to list queue" }, { status: 500 });
  }
}
