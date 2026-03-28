import { NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const EVENTS_DIR = join(MAH_ROOT, ".mah", "events");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");

  try {
    if (!existsSync(EVENTS_DIR)) {
      return NextResponse.json([]);
    }

    const files = readdirSync(EVENTS_DIR)
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .reverse(); // most recent first

    const events: unknown[] = [];

    for (const file of files) {
      const content = readFileSync(join(EVENTS_DIR, file), "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          events.push(JSON.parse(line));
        } catch {
          // skip malformed lines
        }
      }
      if (events.length >= limit) break;
    }

    // Sort by timestamp descending, return latest `limit`
    events.sort((a, b) =>
      new Date((b as { ts: string }).ts).getTime() - new Date((a as { ts: string }).ts).getTime()
    );

    return NextResponse.json(events.slice(0, limit));
  } catch (err) {
    console.error("Failed to read events:", err);
    return NextResponse.json({ error: "Failed to read events" }, { status: 500 });
  }
}
