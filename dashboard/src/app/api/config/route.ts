import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");

function parseYaml(yaml: string): Record<string, unknown> {
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { maxRetries, defaultTier, concurrentLimit, projectName, projectRepo } = body;

    const configPath = join(MAH_ROOT, "mah.yaml");
    if (!existsSync(configPath)) {
      return NextResponse.json({ error: "Config file not found" }, { status: 404 });
    }

    let yaml = readFileSync(configPath, "utf-8");

    // Update qa section values in-place using regex replacement
    if (maxRetries !== undefined) {
      yaml = yaml.replace(
        /^(\s*maxIterations:\s*)\d+/m,
        `$1${Number(maxRetries)}`
      );
    }

    if (defaultTier !== undefined) {
      yaml = yaml.replace(
        /^(\s*defaultTier:\s*)\S+/m,
        `$1${defaultTier}`
      );
    }

    // Update project name
    if (projectName !== undefined) {
      yaml = yaml.replace(
        /^(\s*name:\s*)["']?[^"'\n]+["']?/m,
        `$1"${projectName}"`
      );
    }

    // Update project repo
    if (projectRepo !== undefined) {
      yaml = yaml.replace(
        /^(\s*repo:\s*)\S+/m,
        `$1${projectRepo}`
      );
      // Also update generator cwd
      yaml = yaml.replace(
        /^(\s*cwd:\s*)\S+/m,
        `$1${projectRepo}`
      );
    }

    // Write back
    writeFileSync(configPath, yaml, "utf-8");

    return NextResponse.json({ ok: true, saved: { maxRetries, defaultTier, concurrentLimit, projectName, projectRepo } });
  } catch (err) {
    console.error("Config save error:", err);
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
  }
}
