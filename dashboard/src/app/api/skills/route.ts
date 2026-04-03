import { NextResponse } from "next/server";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const MAH_ROOT = process.cwd().includes("dashboard")
  ? resolve(process.cwd(), "..")
  : process.cwd();

const SKILL_DIRS = ["skills", "global-skills", "imported"] as const;

interface WorkflowStep {
  agent: string;
  action: string;
  input?: string;
  output?: string;
}

interface Skill {
  name: string;
  type: "capability" | "behavioral" | "workflow";
  description: string;
  agentTypes: string[];
  contextFiles?: string[];
  gotchas?: string[];
  constraints?: string[];
  persona?: string;
  steps?: WorkflowStep[];
  tags?: string[];
  source?: { type: string; uri?: string; importedAt: string };
}

/**
 * Recursive YAML parser that handles:
 * - Top-level keys
 * - Nested objects (indented key: value)
 * - Lists (- item)
 * - Lists of objects (- key: value\n  key: value)
 * - Block scalars (|)
 * - Inline lists [a, b, c]
 * - Quoted strings
 */
function parseYaml(text: string): Record<string, unknown> {
  const lines = text.split("\n");
  let i = 0;

  function getIndent(line: string): number {
    const m = line.match(/^(\s*)/);
    return m ? m[1].length : 0;
  }

  function parseValue(val: string): unknown {
    val = val.trim();
    if (val === "" || val === "~" || val === "null") return null;
    if (val === "true") return true;
    if (val === "false") return false;
    // Inline list
    if (val.startsWith("[") && val.endsWith("]")) {
      return val.slice(1, -1).split(",").map(s => parseValue(s.trim().replace(/^['"]|['"]$/g, ""))).filter(v => v !== null && v !== "");
    }
    // Quoted string
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      return val.slice(1, -1);
    }
    // Number
    if (/^-?\d+(\.\d+)?$/.test(val)) return Number(val);
    return val;
  }

  function parseBlock(minIndent: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    while (i < lines.length) {
      const line = lines[i];
      // Skip blank lines and comments
      if (!line.trim() || line.trim().startsWith("#")) { i++; continue; }

      const indent = getIndent(line);
      if (indent < minIndent) break; // dedented past our block

      const trimmed = line.trim();

      // List item at this level
      if (trimmed.startsWith("- ")) {
        break; // lists are handled by the caller
      }

      // Key: value
      const kvMatch = trimmed.match(/^([\w][\w_.-]*)\s*:\s*(.*)/);
      if (!kvMatch) { i++; continue; }

      const key = kvMatch[1];
      const rawVal = kvMatch[2].trim();
      i++;

      // Block scalar (| or >)
      if (rawVal === "|" || rawVal === ">") {
        let blockContent = "";
        while (i < lines.length) {
          const nextLine = lines[i];
          if (!nextLine.trim() && i + 1 < lines.length && getIndent(lines[i + 1]) > indent) {
            blockContent += "\n";
            i++;
            continue;
          }
          if (getIndent(nextLine) <= indent && nextLine.trim()) break;
          if (!nextLine.trim()) { blockContent += "\n"; i++; continue; }
          blockContent += nextLine.trim() + "\n";
          i++;
        }
        result[key] = blockContent.trimEnd();
        continue;
      }

      // Has a value on same line
      if (rawVal) {
        result[key] = parseValue(rawVal);
        continue;
      }

      // Empty value — could be nested object or list
      // Peek at next non-empty line
      let peekIdx = i;
      while (peekIdx < lines.length && (!lines[peekIdx].trim() || lines[peekIdx].trim().startsWith("#"))) peekIdx++;

      if (peekIdx >= lines.length || getIndent(lines[peekIdx]) <= indent) {
        result[key] = null;
        continue;
      }

      const nextTrimmed = lines[peekIdx].trim();
      if (nextTrimmed.startsWith("- ")) {
        // It's a list
        result[key] = parseList(indent + 2);
      } else {
        // It's a nested object
        result[key] = parseBlock(indent + 2);
      }
    }

    return result;
  }

  function parseList(minIndent: number): unknown[] {
    const items: unknown[] = [];

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith("#")) { i++; continue; }

      const indent = getIndent(line);
      if (indent < minIndent - 2) break; // list items can be at minIndent-2 with "- " prefix

      const trimmed = line.trim();
      if (!trimmed.startsWith("- ")) break;

      const itemVal = trimmed.slice(2).trim();
      i++;

      // Check if this list item is an object (has key: value on same line or indented lines follow)
      const kvInItem = itemVal.match(/^([\w][\w_.-]*)\s*:\s*(.*)/);
      if (kvInItem) {
        // Object list item — first key:value is on the "- " line
        const obj: Record<string, unknown> = {};
        obj[kvInItem[1]] = kvInItem[2].trim() ? parseValue(kvInItem[2].trim()) : null;

        // Read continuation lines at deeper indent
        while (i < lines.length) {
          const nextLine = lines[i];
          if (!nextLine.trim() || nextLine.trim().startsWith("#")) { i++; continue; }
          const nextIndent = getIndent(nextLine);
          if (nextIndent <= indent) break;
          const nextKv = nextLine.trim().match(/^([\w][\w_.-]*)\s*:\s*(.*)/);
          if (nextKv) {
            obj[nextKv[1]] = nextKv[2].trim() ? parseValue(nextKv[2].trim()) : null;
            i++;
          } else {
            break;
          }
        }
        items.push(obj);
      } else {
        // Simple scalar list item
        items.push(parseValue(itemVal.replace(/^['"]|['"]$/g, "")));
      }
    }

    return items;
  }

  return parseBlock(0);
}

function loadAllSkills(): (Skill & { dir: string })[] {
  const skills: (Skill & { dir: string })[] = [];

  for (const dir of SKILL_DIRS) {
    const fullDir = join(MAH_ROOT, ".mah", dir);
    if (!existsSync(fullDir)) continue;

    const files = readdirSync(fullDir).filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml")
    );

    for (const file of files) {
      try {
        const raw = readFileSync(join(fullDir, file), "utf-8");
        const parsed = parseYaml(raw);
        if (!parsed?.name) continue;

        skills.push({
          name: parsed.name as string,
          type: (parsed.type as Skill["type"]) ?? "capability",
          description: (parsed.description as string) ?? "",
          agentTypes: (parsed.agent_types as string[]) ??
            (parsed.agentTypes as string[]) ?? [],
          contextFiles: parsed.context_files as string[] | undefined,
          gotchas: parsed.gotchas as string[] | undefined,
          constraints: parsed.constraints as string[] | undefined,
          persona: parsed.persona as string | undefined,
          steps: parsed.steps as WorkflowStep[] | undefined,
          tags: parsed.tags as string[] | undefined,
          source: parsed.source as Skill["source"] | undefined,
          dir,
        });
      } catch {
        // skip malformed
      }
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET() {
  try {
    const skills = loadAllSkills();
    return NextResponse.json(skills);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
