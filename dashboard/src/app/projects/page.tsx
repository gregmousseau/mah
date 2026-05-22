import Link from "next/link";
import type { Project } from "@/types/mah";
import {
  primaryRoot,
  loadProjects,
  loadAllSprints,
  resolveMahRoot,
} from "@/lib/mahRoot";

function getProjects(): Project[] {
  const root = primaryRoot(process.cwd());
  const projects = loadProjects(root);
  const allSprints = loadAllSprints(root);

  return projects.map((project): Project => {
    const projectRoot = resolveMahRoot(project, root);
    const projectSprints = allSprints.filter(
      (s) => s.projectId === project.id || s.projectRoot === projectRoot
    );

    const passedSprints = projectSprints.filter(
      (s) => s.verdict === "pass" || s.status === "passed"
    );
    const passRate = projectSprints.length > 0
      ? Math.round((passedSprints.length / projectSprints.length) * 100)
      : 0;
    const totalCost = projectSprints.reduce((sum, s) => sum + (s.totalCost || 0), 0);
    const sortedByDate = [...projectSprints]
      .filter((s) => s.createdAt)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      repo: project.repo,
      createdAt: project.createdAt ?? new Date().toISOString(),
      config: project.config as Project['config'],
      sprintCount: projectSprints.length,
      passRate,
      totalCost: Math.round(totalCost * 1000) / 1000,
      lastSprintDate: sortedByDate[0]?.createdAt || undefined,
    };
  });
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
