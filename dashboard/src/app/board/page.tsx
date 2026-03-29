"use client";

import Link from "next/link";
import { useState } from "react";
import { usePolling } from "@/hooks/usePolling";
import type { SprintSummary, Project } from "@/types/mah";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getProjectAccent(projectId?: string | null): string {
  if (projectId === "w-construction") return "#f59e0b";
  if (projectId === "mah-build") return "#a855f7";
  if (!projectId) return "#555565";
  const hash = projectId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return `hsl(${hash % 360}, 70%, 65%)`;
}

function formatCost(cost: number): string {
  if (cost === 0) return "—";
  return `$${cost.toFixed(2)}`;
}

function formatDuration(start?: string | null, end?: string | null): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "<1m";
  return `${mins}m`;
}

function nextActionForSprint(sprint: SprintSummary): string {
  switch (sprint.status) {
    case "draft": return "Awaiting approval";
    case "planned": return "Planned — pending scheduling";
    case "approved": return "Approved — ready to run";
    case "queued": return "Queued — waiting to start";
    case "running": return "Running now…";
    case "passed": return "Ready for human review";
    case "failed": return "Review defects & re-run";
    default: return sprint.status;
  }
}

// ─── Column Config ────────────────────────────────────────────────────────────

interface ColumnConfig {
  status: string;
  label: string;
  color: string;
  bg: string;
}

const COLUMNS: ColumnConfig[] = [
  { status: "draft",    label: "Draft",    color: "#888898", bg: "rgba(136,136,152,0.06)" },
  { status: "planned",  label: "Planned",  color: "#3b82f6", bg: "rgba(59,130,246,0.06)"  },
  { status: "approved", label: "Approved", color: "#f59e0b", bg: "rgba(245,158,11,0.06)"  },
  { status: "running",  label: "Running",  color: "#a855f7", bg: "rgba(168,85,247,0.06)"  },
  { status: "passed",   label: "Passed",   color: "#22c55e", bg: "rgba(34,197,94,0.06)"   },
  { status: "failed",   label: "Failed",   color: "#ef4444", bg: "rgba(239,68,68,0.06)"   },
];

// ─── Sprint Card ──────────────────────────────────────────────────────────────

function SprintCard({ sprint, projects }: { sprint: SprintSummary; projects: Project[] }) {
  const accent = getProjectAccent(sprint.projectId);
  const project = projects.find((p) => p.id === sprint.projectId);
  const isRunning = sprint.status === "running";

  return (
    <Link
      href={`/sprints/${sprint.id}`}
      style={{
        display: "block",
        textDecoration: "none",
        background: "#141420",
        border: "1px solid #2a2a3a",
        borderRadius: "10px",
        padding: "12px 14px",
        marginBottom: "8px",
        transition: "border-color 0.15s, box-shadow 0.15s",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
      }}
      className="kanban-card"
    >
      {/* Running pulse strip */}
      {isRunning && (
        <div style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "3px",
          background: "#a855f7",
          borderRadius: "10px 0 0 10px",
        }} />
      )}

      {/* Sprint name */}
      <div style={{
        fontSize: "13px",
        fontWeight: 600,
        color: "#e0e0e8",
        marginBottom: "8px",
        lineHeight: 1.4,
        paddingLeft: isRunning ? "6px" : "0",
      }}>
        #{sprint.id} {sprint.name}
      </div>

      {/* Project badge */}
      {sprint.projectId && (
        <div style={{ marginBottom: "8px" }}>
          <span style={{
            fontSize: "10px",
            color: accent,
            background: `${accent}18`,
            border: `1px solid ${accent}40`,
            borderRadius: "4px",
            padding: "2px 6px",
            fontWeight: 500,
          }}>
            {project?.name || sprint.projectId}
          </span>
        </div>
      )}

      {/* Stats row */}
      <div style={{
        display: "flex",
        gap: "12px",
        marginBottom: "8px",
        flexWrap: "wrap",
      }}>
        <span style={{ fontSize: "11px", color: "#a855f7" }}>
          {formatCost(sprint.totalCost)}
        </span>
        <span style={{ fontSize: "11px", color: "#555565" }}>
          ⏱ {formatDuration(sprint.createdAt, sprint.completedAt)}
        </span>
        {sprint.iterations > 0 && (
          <span style={{ fontSize: "11px", color: "#555565" }}>
            {sprint.iterations} iter
          </span>
        )}
      </div>

      {/* Next action */}
      <div style={{
        fontSize: "11px",
        color: "#888898",
        background: "#0d0d18",
        borderRadius: "5px",
        padding: "4px 8px",
        lineHeight: 1.4,
      }}>
        → {nextActionForSprint(sprint)}
      </div>
    </Link>
  );
}

// ─── Board Column ─────────────────────────────────────────────────────────────

function BoardColumn({ col, sprints, projects }: { col: ColumnConfig; sprints: SprintSummary[]; projects: Project[] }) {
  return (
    <div style={{
      minWidth: "220px",
      flex: "1 1 220px",
      maxWidth: "300px",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Column header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 12px",
        background: col.bg,
        border: `1px solid ${col.color}30`,
        borderRadius: "10px 10px 0 0",
        borderBottom: "none",
        marginBottom: "0",
      }}>
        <div style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: col.color,
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: "12px",
          fontWeight: 700,
          color: col.color,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}>
          {col.label}
        </span>
        <span style={{
          marginLeft: "auto",
          fontSize: "11px",
          fontWeight: 700,
          color: sprints.length > 0 ? col.color : "#555565",
          background: sprints.length > 0 ? `${col.color}20` : "#1a1a2a",
          border: `1px solid ${sprints.length > 0 ? col.color + "40" : "#2a2a3a"}`,
          borderRadius: "10px",
          padding: "1px 7px",
          minWidth: "20px",
          textAlign: "center",
        }}>
          {sprints.length}
        </span>
      </div>

      {/* Cards area */}
      <div style={{
        flex: 1,
        padding: "10px",
        background: col.bg,
        border: `1px solid ${col.color}20`,
        borderTop: "none",
        borderRadius: "0 0 10px 10px",
        minHeight: "120px",
      }}>
        {sprints.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "20px 12px",
            fontSize: "12px",
            color: "#333345",
            fontStyle: "italic",
          }}>
            No sprints
          </div>
        ) : (
          sprints.map((s) => (
            <SprintCard key={s.id} sprint={s} projects={projects} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BoardPage() {
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const { data: sprints } = usePolling<SprintSummary[]>("/api/sprints", 8000);
  const { data: projects } = usePolling<Project[]>("/api/projects", 30000);

  const allSprints = sprints || [];
  const allProjects = projects || [];

  const filtered = projectFilter === "all"
    ? allSprints
    : allSprints.filter((s) => (s.projectId || null) === (projectFilter === "none" ? null : projectFilter));

  return (
    <div style={{ padding: "32px", minWidth: 0 }}>
      {/* Page header */}
      <div style={{
        marginBottom: "24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: "16px",
        flexWrap: "wrap",
      }}>
        <div>
          <h1 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 700, color: "#e0e0e8" }}>
            Board
          </h1>
          <div style={{ fontSize: "13px", color: "#888898" }}>
            {filtered.length} sprint{filtered.length !== 1 ? "s" : ""}
            {projectFilter !== "all" && " (filtered)"}
          </div>
        </div>

        {/* Project filter */}
        {allProjects.length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={() => setProjectFilter("all")}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid",
                borderColor: projectFilter === "all" ? "#7c3aed" : "#2a2a3a",
                background: projectFilter === "all" ? "rgba(124,58,237,0.15)" : "transparent",
                color: projectFilter === "all" ? "#a855f7" : "#888898",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              All
            </button>
            {allProjects.map((project) => {
              const accent = getProjectAccent(project.id);
              const active = projectFilter === project.id;
              return (
                <button
                  key={project.id}
                  onClick={() => setProjectFilter(active ? "all" : project.id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid",
                    borderColor: active ? accent : "#2a2a3a",
                    background: active ? `${accent}18` : "transparent",
                    color: active ? accent : "#888898",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {project.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Kanban columns */}
      <div style={{
        display: "flex",
        gap: "12px",
        overflowX: "auto",
        paddingBottom: "16px",
        alignItems: "flex-start",
      }}>
        {COLUMNS.map((col) => {
          const colSprints = filtered.filter((s) => {
            // Map running-adjacent statuses into the running column
            if (col.status === "running") return s.status === "running" || s.status === "dev" || s.status === "qa" || s.status === "queued";
            return s.status === col.status;
          });
          return (
            <BoardColumn
              key={col.status}
              col={col}
              sprints={colSprints}
              projects={allProjects}
            />
          );
        })}
      </div>

      <style>{`
        .kanban-card:hover {
          border-color: #3a3a4a !important;
          box-shadow: 0 2px 12px rgba(0,0,0,0.3);
        }
      `}</style>
    </div>
  );
}
