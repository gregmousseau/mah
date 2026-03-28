import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");

function parseYaml(yaml: string): Record<string, unknown> {
  // Simple YAML parser for our specific mah.yaml structure
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  let currentSection: string | null = null;
  let currentSubSection: string | null = null;
  let currentAgent: string | null = null;

  for (const line of lines) {
    if (line.trim().startsWith("#") || !line.trim()) continue;

    const indent = line.match(/^(\s*)/)?.[1]?.length || 0;
    const content = line.trim();

    if (indent === 0 && content.endsWith(":")) {
      currentSection = content.slice(0, -1);
      currentSubSection = null;
      currentAgent = null;
      if (!result[currentSection]) result[currentSection] = {};
    } else if (indent === 2 && currentSection) {
      if (content.endsWith(":")) {
        currentSubSection = content.slice(0, -1);
        currentAgent = null;
        (result[currentSection] as Record<string, unknown>)[currentSubSection] = {};
      } else {
        const [key, ...vals] = content.split(":");
        const val = vals.join(":").trim().replace(/^["']|["']$/g, "");
        (result[currentSection] as Record<string, unknown>)[key.trim()] = isNaN(Number(val)) ? val : Number(val);
      }
    } else if (indent === 4 && currentSection) {
      if (content.endsWith(":")) {
        currentAgent = content.slice(0, -1);
        if (currentSubSection) {
          ((result[currentSection] as Record<string, unknown>)[currentSubSection] as Record<string, unknown>)[currentAgent] = {};
        }
      } else {
        const [key, ...vals] = content.split(":");
        const val = vals.join(":").trim().replace(/^["']|["']$/g, "");
        if (currentAgent && currentSubSection) {
          (((result[currentSection] as Record<string, unknown>)[currentSubSection] as Record<string, unknown>)[currentAgent] as Record<string, unknown>)[key.trim()] = isNaN(Number(val)) ? val : Number(val);
        } else if (currentSubSection) {
          ((result[currentSection] as Record<string, unknown>)[currentSubSection] as Record<string, unknown>)[key.trim()] = isNaN(Number(val)) ? val : Number(val);
        }
      }
    } else if (indent === 6 && currentSection && currentSubSection && currentAgent) {
      const [key, ...vals] = content.split(":");
      const val = vals.join(":").trim().replace(/^["']|["']$/g, "");
      (((result[currentSection] as Record<string, unknown>)[currentSubSection] as Record<string, unknown>)[currentAgent] as Record<string, unknown>)[key.trim()] = isNaN(Number(val)) ? val : Number(val);
    }
  }

  return result;
}

export async function GET() {
  try {
    const configPath = join(MAH_ROOT, "mah.yaml");
    const yaml = readFileSync(configPath, "utf-8");
    const config = parseYaml(yaml);
    return NextResponse.json(config);
  } catch {
    return NextResponse.json({ error: "Config not found" }, { status: 404 });
  }
}
