/**
 * Shared helpers for multi-project MAH dashboard.
 *
 * Project JSONs live in <primaryRoot>/.mah/projects/*.json.
 * Each project may declare a `mahRoot` field — an absolute or ~-relative
 * path to its own .mah directory root. Sprints, metrics, and events are
 * read from each project's own root instead of only the primary one.
 */
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

// ── Types ──

export interface ProjectConfig {
  id: string;
  name: string;
  description?: string;
  repo?: string;
  mahRoot?: string;           // optional override (absolute or ~/…)
  createdAt?: string;
  config?: Record<string, unknown>;
}

export interface SprintData {
  id: string;
  name: string;
  task?: string;
  status: string;
  verdict: string;
  iterations: number;
  totalCost: number;
  createdAt: string | null;
  completedAt: string | null;
  scheduledFor?: string | null;
  projectId: string | null;
  agentConfig?: unknown;
  sprintType?: string | null;
  projectRoot: string;        // which mahRoot this sprint came from
}

// ── Primary root (this dashboard instance) ──

/** The primary .mah root — always the dashboard's sibling. */
export function primaryRoot(cwd: string): string {
  return join(cwd, "..");
}

function mahDir(root: string, ...segments: string[]): string {
  return join(root, ".mah", ...segments);
}

// ── Project loading ──

/**
 * Load all project configs from the primary projects directory.
 * Merges in a synthetic "primary" project if the directory exists.
 */
export function loadProjects(primaryMahRoot: string): ProjectConfig[] {
  const projectsDir = mahDir(primaryMahRoot, "projects");
  if (!existsSync(projectsDir)) return [];

  return readdirSync(projectsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(projectsDir, f), "utf-8")) as ProjectConfig);
}

/**
 * Given a project config, resolve its mahRoot to an absolute path.
 * Falls back to the primary root if not specified.
 */
export function resolveMahRoot(project: ProjectConfig, fallback: string): string {
  if (!project.mahRoot) return fallback;
  const expanded = project.mahRoot.replace(/^~/, homedir());
  return resolve(expanded);
}

/**
 * Build a map of projectId → resolved mahRoot for all projects.
 */
export function buildProjectRootMap(primaryMahRoot: string): Map<string, string> {
  const projects = loadProjects(primaryMahRoot);
  const map = new Map<string, string>();
  for (const p of projects) {
    map.set(p.id, resolveMahRoot(p, primaryMahRoot));
  }
  return map;
}

/**
 * Get all unique mahRoot paths to scan for sprints.
 * Includes the primary root plus any project-specific roots.
 */
export function allMahRoots(primaryMahRoot: string): string[] {
  const projects = loadProjects(primaryMahRoot);
  const roots = new Set<string>([primaryMahRoot]);
  for (const p of projects) {
    roots.add(resolveMahRoot(p, primaryMahRoot));
  }
  return [...roots];
}

// ── Sprint helpers ──

export function isRealSprint(dirName: string, contract: Record<string, unknown> | null): boolean {
  if (!contract) return false;
  const id = contract.id as string || "";
  const status = contract.status as string || "";
  const lifecycleStatuses = [
    "draft", "planned", "scheduled", "approved",
    "queued", "running", "passed", "failed", "escalated", "cancelled",
  ];
  if (lifecycleStatuses.includes(status)) return true;
  if (/^\d{3}$/.test(id)) return true;
  if (/^\d{3}-/.test(dirName)) return true;
  return false;
}

/**
 * Load sprints from a single mahRoot.
 * Returns raw sprint data with the source root attached.
 */
export function loadSprintsFromRoot(root: string): SprintData[] {
  const sprintsDir = mahDir(root, "sprints");
  const metricsDir = mahDir(root, "metrics");

  if (!existsSync(sprintsDir)) return [];

  const sprintDirs = readdirSync(sprintsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  return sprintDirs
    .map((dir) => {
      const contractPath = join(sprintsDir, dir, "contract.json");
      const metricsPathOld = join(sprintsDir, dir, "metrics.json");

      let contract: Record<string, unknown> | null = null;
      let metrics: Record<string, unknown> | null = null;

      if (existsSync(contractPath)) {
        contract = JSON.parse(readFileSync(contractPath, "utf-8"));
      }

      // Try old location first (sprint-specific)
      if (existsSync(metricsPathOld)) {
        metrics = JSON.parse(readFileSync(metricsPathOld, "utf-8"));
      }
      // Then try new centralized location using sprint ID
      else if (contract?.id) {
        const metricsPathNew = join(metricsDir, `${contract.id}.json`);
        if (existsSync(metricsPathNew)) {
          metrics = JSON.parse(readFileSync(metricsPathNew, "utf-8"));
        }
      }

      return { dir, contract, metrics, projectRoot: root };
    })
    .filter(({ dir, contract }) => isRealSprint(dir, contract))
    .map(({ contract, metrics, projectRoot }) => {
      const status = (contract?.status as string) || "unknown";
      let verdict = (metrics?.verdict as string) || (status === "passed" ? "pass" : "unknown");
      if (["draft", "scheduled", "approved"].includes(status)) {
        verdict = status;
      }
      return {
        id: (contract?.id as string) || "",
        name: (contract?.name as string) || "",
        task: (contract?.task as string) || "",
        status,
        verdict,
        iterations: (metrics as any)?.totals?.iterations || (contract?.iterations as any[])?.length || 0,
        totalCost: (metrics as any)?.totals?.estimatedCost || 0,
        createdAt: (contract?.createdAt as string) || null,
        completedAt: (contract?.completedAt as string) || null,
        scheduledFor: (contract?.scheduledFor as string) || null,
        projectId: (contract?.projectId as string) || null,
        agentConfig: contract?.agentConfig || null,
        sprintType: (contract?.sprintType as string) || null,
        projectRoot,
      };
    });
}

/**
 * Load sprints from ALL known roots (primary + project-specific).
 */
export function loadAllSprints(primaryMahRoot: string): SprintData[] {
  const roots = allMahRoots(primaryMahRoot);
  const all: SprintData[] = [];
  for (const root of roots) {
    all.push(...loadSprintsFromRoot(root));
  }
  return all;
}

/**
 * Load a single sprint's contract + metrics by its ID, searching all roots.
 */
export function findSprint(
  sprintId: string,
  primaryMahRoot: string,
): { contract: Record<string, unknown>; metrics: Record<string, unknown> | null; root: string } | null {
  const roots = allMahRoots(primaryMahRoot);
  for (const root of roots) {
    const sprintsDir = mahDir(root, "sprints");
    if (!existsSync(sprintsDir)) continue;

    const dirs = readdirSync(sprintsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const dir of dirs) {
      const contractPath = join(sprintsDir, dir, "contract.json");
      if (!existsSync(contractPath)) continue;

      const contract = JSON.parse(readFileSync(contractPath, "utf-8"));
      if (contract.id === sprintId) {
        const metricsDir = mahDir(root, "metrics");
        let metrics: Record<string, unknown> | null = null;
        const metricsPathOld = join(sprintsDir, dir, "metrics.json");
        if (existsSync(metricsPathOld)) {
          metrics = JSON.parse(readFileSync(metricsPathOld, "utf-8"));
        } else if (contract.id) {
          const metricsPathNew = join(metricsDir, `${contract.id}.json`);
          if (existsSync(metricsPathNew)) {
            metrics = JSON.parse(readFileSync(metricsPathNew, "utf-8"));
          }
        }
        return { contract, metrics, root };
      }
    }
  }
  return null;
}
