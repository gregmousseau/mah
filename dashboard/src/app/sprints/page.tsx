"use client";

import Link from "next/link";
import { useState } from "react";
import VerdictBadge from "@/components/VerdictBadge";
import CountdownTimer from "@/components/CountdownTimer";
import { usePolling } from "@/hooks/usePolling";
import type { SprintSummary, Project } from "@/types/mah";
import { getAgentColor } from "@/lib/agents";

function AgentDot({ agentId, agentName }: { agentId: string; agentName: string }) {
  const color = getAgentColor(agentId);
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      fontSize: "10px",
      color,
      marginTop: "3px",
    }}>
      <span style={{
        width: "6px", height: "6px", borderRadius: "50%",
        background: color, display: "inline-block", flexShrink: 0,
      }} />
      {agentName}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDuration(start?: string, end?: string) {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  return `${mins}m`;
}

function getProjectAccent(projectId?: string | null): { color: string } {
  if (projectId === "w-construction") return { color: "#f59e0b" };
  if (projectId === "mah-build") return { color: "#a855f7" };
  if (!projectId) return { color: "#555565" };
  const hash = projectId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return { color: `hsl(${hash % 360}, 70%, 65%)` };
}

function ProjectBadge({ projectId, projects }: { projectId?: string | null; projects: Project[] }) {
  if (!projectId) {
    return (
      <span style={{
        fontSize: "10px",
        color: "#555565",
        background: "rgba(85,85,101,0.1)",
        border: "1px solid rgba(85,85,101,0.2)",
        borderRadius: "4px",
        padding: "2px 6px",
        fontWeight: 500,
      }}>
        Uncategorized
      </span>
    );
  }
  const project = projects.find((p) => p.id === projectId);
  const accent = getProjectAccent(projectId);
  return (
    <span style={{
      fontSize: "10px",
      color: accent.color,
      background: `${accent.color}18`,
      border: `1px solid ${accent.color}40`,
      borderRadius: "4px",
      padding: "2px 6px",
      fontWeight: 500,
      whiteSpace: "nowrap",
    }}>
      {project?.name || projectId}
    </span>
  );
}

export default function SprintsPage() {
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const { data: sprints } = usePolling<SprintSummary[]>("/api/sprints", 10000);
  const { data: projects } = usePolling<Project[]>("/api/projects", 30000);

  const allSprints = sprints || [];
  const allProjects = projects || [];

  const filtered = projectFilter === "all"
    ? allSprints
    : allSprints.filter((s) => (s.projectId || null) === (projectFilter === "none" ? null : projectFilter));

  const displaySprints = [...filtered].reverse();

  return (
    <div style={{ padding: "32px", maxWidth: "1000px" }}>
      <div style={{ marginBottom: "28px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 700, color: "#e0e0e8" }}>Sprints</h1>
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
                    borderColor: active ? accent.color : "#2a2a3a",
                    background: active ? `${accent.color}18` : "transparent",
                    color: active ? accent.color : "#888898",
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

      {displaySprints.length === 0 ? (
        <div style={{
          background: "#141420",
          border: "1px solid #2a2a3a",
          borderRadius: "12px",
          padding: "48px",
          textAlign: "center",
          color: "#888898",
        }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>⚡</div>
          <div style={{ fontSize: "16px", fontWeight: 600, color: "#e0e0e8", marginBottom: "6px" }}>
            {projectFilter !== "all" ? "No sprints in this project" : "No sprints yet"}
          </div>
          <div style={{ fontSize: "13px", marginBottom: "16px" }}>
            {projectFilter !== "all" ? "Try selecting a different project filter." : "Run your first sprint to get started."}
          </div>
          {projectFilter === "all" && (
            <code style={{ background: "#0d0d18", border: "1px solid #2a2a3a", borderRadius: "6px", padding: "6px 12px", fontSize: "13px", color: "#a855f7" }}>
              mah run
            </code>
          )}
        </div>
      ) : (
        <div style={{ background: "#141420", border: "1px solid #2a2a3a", borderRadius: "12px", overflow: "hidden" }}>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 140px 120px 80px 80px 100px",
            gap: "12px",
            padding: "12px 20px",
            borderBottom: "1px solid #2a2a3a",
            fontSize: "11px",
            color: "#888898",
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}>
            <div>ID</div>
            <div>Sprint</div>
            <div>Project</div>
            <div>Date</div>
            <div>Iter</div>
            <div>Cost</div>
            <div>Verdict</div>
          </div>

          {/* Rows */}
          {displaySprints.map((sprint, i) => (
            <Link
              key={sprint.id}
              href={`/sprints/${sprint.id}`}
              style={{
                display: "grid",
                gridTemplateColumns: "60px 1fr 140px 120px 80px 80px 100px",
                gap: "12px",
                padding: "13px 20px",
                borderBottom: i < displaySprints.length - 1 ? "1px solid #1e1e2e" : "none",
                textDecoration: "none",
                color: "inherit",
                alignItems: "center",
                transition: "background 0.15s",
              }}
              className="sprint-row"
            >
              <div style={{ fontSize: "12px", color: "#888898", fontFamily: "monospace" }}>
                #{sprint.id}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  {sprint.status === "scheduled" && <span title="Scheduled">🕐</span>}
                  {sprint.status === "running" && <div className="dot-pulse" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#a855f7", flexShrink: 0 }} />}
                  {sprint.status === "queued" && <span title="Queued">⏳</span>}
                  <span style={{ fontSize: "14px", color: "#e0e0e8", fontWeight: 500 }}>{sprint.name}</span>
                  {sprint.iterations > 0 && (
                    <span style={{
                      fontSize: "10px",
                      color: sprint.iterations > 1 ? "#f59e0b" : "#22c55e",
                      background: sprint.iterations > 1 ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)",
                      border: `1px solid ${sprint.iterations > 1 ? "rgba(245,158,11,0.25)" : "rgba(34,197,94,0.25)"}`,
                      borderRadius: "4px",
                      padding: "1px 6px",
                      fontWeight: 600,
                    }}>
                      {sprint.iterations} iter
                    </span>
                  )}
                </div>
                {sprint.agentConfig?.generator && (
                  <AgentDot agentId={sprint.agentConfig.generator.agentId} agentName={sprint.agentConfig.generator.agentName} />
                )}
              </div>
              <div>
                <ProjectBadge projectId={sprint.projectId} projects={allProjects} />
              </div>
              <div style={{ fontSize: "12px", color: "#888898" }}>
                {sprint.createdAt ? formatDate(sprint.createdAt) : "—"}
                <div style={{ fontSize: "11px", color: "#555565", marginTop: "2px" }}>
                  {sprint.scheduledFor
                    ? <CountdownTimer iso={sprint.scheduledFor} prefix="in" />
                    : formatDuration(sprint.createdAt, sprint.completedAt)}
                </div>
              </div>
              <div style={{ fontSize: "13px", color: "#e0e0e8", textAlign: "center" }}>
                {sprint.iterations || "—"}
              </div>
              <div style={{ fontSize: "13px", color: "#a855f7" }}>
                ${sprint.totalCost.toFixed(2)}
              </div>
              <div>
                <VerdictBadge verdict={sprint.verdict} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
