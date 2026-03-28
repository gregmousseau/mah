import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const HEARTBEAT_PATH = join(MAH_ROOT, ".mah", "heartbeat.json");

export async function GET() {
  try {
    if (!existsSync(HEARTBEAT_PATH)) {
      return NextResponse.json(null);
    }
    const data = JSON.parse(readFileSync(HEARTBEAT_PATH, "utf-8"));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(null);
  }
}
