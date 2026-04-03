import Link from "next/link";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Project } from "@/types/mah";

const MAH_ROOT = resolve(process.cwd(), "..");
const PROJECTS_DIR = join(MAH_ROOT, ".mah", "projects");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");

function getProjects(): Project[] {
  if (!existsSync(PROJECTS_DIR)) return [];

  const files = readdirSync(PROJECTS_DIR).filter(f => f.endsWith(".json"));
  const projects: Project[] = [];

  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(PROJECTS_DIR, file), "utf-8"));

      // Count sprints for this project
      let sprintCount = 0;
      let passCount = 0;
      let totalCost = 0;
      let lastDate = "";

      if (existsSync(SPRINTS_DIR)) {
        const sprintDirs = readdirSync(SPRINTS_DIR, { withFileTypes: true })
          .filter(d => d.isDirectory());

        for (const dir of sprintDirs) {
          const contractPath = join(SPRINTS_DIR, dir.name, "contract.json");
          if (!existsSync(contractPath)) continue;
          try {
            const contract = JSON.parse(readFileSync(contractPath, "utf-8"));
            if (contract.projectId !== raw.id) continue;
            sprintCount++;
            if (contract.status === "passed") passCount++;
            if (contract.createdAt > lastDate) lastDate = contract.createdAt;

            const metricsPath = join(SPRINTS_DIR, dir.name, "metrics.json");
            if (existsSync(metricsPath)) {
              const metrics = JSON.parse(readFileSync(metricsPath, "utf-8"));
              totalCost += metrics.totals?.estimatedCost ?? 0;
            }
          } catch { /* skip */ }
        }
      }

      projects.push({
        ...raw,
        sprintCount,
        passRate: sprintCount > 0 ? Math.round((passCount / sprintCount) * 100) : 0,
        totalCost: Math.round(totalCost * 1000) / 1000,
        lastSprintDate: lastDate || undefined,
      });
    } catch { /* skip */ }
  }

  return projects;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getProjectAccent(id: string): { color: string; bg: string; border: string } {
  if (id === "w-construction") {
    return { color: "#eab308", bg: "rgba(234,179,8,0.08)", border: "rgba(234,179,8,0.2)" };
  }
  if (id === "mah-build") {
    return { color: "#fb923c", bg: "rgba(251,146,60,0.08)", border: "rgba(251,146,60,0.2)" };
  }
  const hash = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = hash % 360;
  return {
    color: `hsl(${hue}, 70%, 65%)`,
    bg: `hsla(${hue}, 70%, 65%, 0.08)`,
    border: `hsla(${hue}, 70%, 65%, 0.2)`,
  };
}

export const dynamic = "force-dynamic";

export default function ProjectsPage() {
  const projects = getProjects();

  return (
    <div style={{ padding: "32px", maxWidth: "900px" }}>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 700, color: "#e0e0e8" }}>
          Projects
        </h1>
        <div style={{ fontSize: "13px", color: "#9ca3af" }}>
          {projects.length} project{projects.length !== 1 ? "s" : ""} configured
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {projects.map((project) => {
          const accent = getProjectAccent(project.id);
          return (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              style={{
                display: "block",
                textDecoration: "none",
                background: "#0f1116",
                borderTop: `1px solid ${accent.border}`,
                borderRight: `1px solid ${accent.border}`,
                borderBottom: `1px solid ${accent.border}`,
                borderLeft: `4px solid ${accent.color}`,
                borderRadius: "12px",
                padding: "20px 24px",
                transition: "all 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "17px", fontWeight: 700, color: "#e0e0e8" }}>
                      {project.name}
                    </span>
                  </div>
                  {project.description && (
                    <div style={{ fontSize: "13px", color: "#9ca3af", marginBottom: "8px" }}>
                      {project.description}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    <Stat label="Sprints" value={String(project.sprintCount ?? 0)} />
                    <Stat label="Pass rate" value={`${project.passRate ?? 0}%`} color={(project.passRate ?? 0) >= 80 ? "#22c55e" : "#eab308"} />
                    <Stat label="Cost" value={`$${(project.totalCost ?? 0).toFixed(2)}`} />
                    {project.lastSprintDate && (
                      <Stat label="Last sprint" value={formatDate(project.lastSprintDate)} />
                    )}
                  </div>
                </div>
                <div style={{ fontSize: "12px", color: "#555565", fontFamily: "monospace", flexShrink: 0 }}>
                  {project.repo}
                </div>
              </div>
            </Link>
          );
        })}

        {projects.length === 0 && (
          <div style={{ padding: "40px", textAlign: "center", color: "#555565", fontSize: "14px" }}>
            No projects yet. Run <code style={{ color: "#fb923c" }}>mah project create</code> to add one.
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "#555565", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>
        {label}
      </div>
      <div style={{ fontSize: "14px", fontWeight: 600, color: color ?? "#e0e0e8" }}>
        {value}
      </div>
    </div>
  );
}
