import Link from "next/link";
import type { Project } from "@/types/mah";

async function getProjects(): Promise<Project[]> {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3333";
  const res = await fetch(`${base}/api/projects`, { cache: "no-store" });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
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
    return { color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)" };
  }
  if (id === "mah-build") {
    return { color: "#a855f7", bg: "rgba(168,85,247,0.08)", border: "rgba(168,85,247,0.2)" };
  }
  // Default: generate from hash
  const hash = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = hash % 360;
  return {
    color: `hsl(${hue}, 70%, 65%)`,
    bg: `hsla(${hue}, 70%, 65%, 0.08)`,
    border: `hsla(${hue}, 70%, 65%, 0.2)`,
  };
}

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <div style={{ padding: "32px", maxWidth: "1000px" }}>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 700, color: "#e0e0e8" }}>Projects</h1>
        <div style={{ fontSize: "13px", color: "#888898" }}>
          {projects.length} project{projects.length !== 1 ? "s" : ""}
        </div>
      </div>

      {projects.length === 0 ? (
        <div style={{
          background: "#141420",
          border: "1px solid #2a2a3a",
          borderRadius: "12px",
          padding: "48px",
          textAlign: "center",
          color: "#888898",
        }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>📁</div>
          <div style={{ fontSize: "16px", fontWeight: 600, color: "#e0e0e8", marginBottom: "6px" }}>No projects yet</div>
          <div style={{ fontSize: "13px" }}>Add project files to .mah/projects/</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px" }}>
          {projects.map((project) => {
            const accent = getProjectAccent(project.id);
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                style={{ textDecoration: "none" }}
              >
                <div
                  style={{
                    background: "#141420",
                    border: `1px solid #2a2a3a`,
                    borderRadius: "14px",
                    padding: "24px",
                    cursor: "pointer",
                    transition: "border-color 0.15s, transform 0.1s",
                    position: "relative",
                    overflow: "hidden",
                  }}
                  className="project-card"
                >
                  {/* Accent bar */}
                  <div style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "3px",
                    background: accent.color,
                    borderRadius: "14px 14px 0 0",
                  }} />

                  {/* Header */}
                  <div style={{ marginBottom: "16px", paddingTop: "4px" }}>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: "#e0e0e8", marginBottom: "6px" }}>
                      {project.name}
                    </div>
                    {project.description && (
                      <div style={{ fontSize: "13px", color: "#888898", lineHeight: 1.5 }}>
                        {project.description}
                      </div>
                    )}
                  </div>

                  {/* Stats row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "16px" }}>
                    <div style={{ textAlign: "center", background: "#0d0d18", borderRadius: "8px", padding: "10px 8px" }}>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#e0e0e8" }}>{project.sprintCount ?? 0}</div>
                      <div style={{ fontSize: "10px", color: "#555565", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sprints</div>
                    </div>
                    <div style={{ textAlign: "center", background: "#0d0d18", borderRadius: "8px", padding: "10px 8px" }}>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#22c55e" }}>{project.passRate ?? 0}%</div>
                      <div style={{ fontSize: "10px", color: "#555565", textTransform: "uppercase", letterSpacing: "0.05em" }}>Pass Rate</div>
                    </div>
                    <div style={{ textAlign: "center", background: "#0d0d18", borderRadius: "8px", padding: "10px 8px" }}>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: accent.color }}>${(project.totalCost ?? 0).toFixed(2)}</div>
                      <div style={{ fontSize: "10px", color: "#555565", textTransform: "uppercase", letterSpacing: "0.05em" }}>Cost</div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", color: "#555565" }}>
                    {project.repo && (
                      <code style={{ background: "#0d0d18", padding: "2px 6px", borderRadius: "4px", color: "#888898" }}>
                        {project.repo}
                      </code>
                    )}
                    {project.lastSprintDate && (
                      <span>Last sprint: {formatDate(project.lastSprintDate)}</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
