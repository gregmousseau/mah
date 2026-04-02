"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
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
  if (projectId === "w-construction") return { color: "#eab308" };
  if (projectId === "mah-build") return { color: "#fb923c" };
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

const STATUS_OPTIONS = ["All", "Draft", "Running", "Passed", "Failed"] as const;
type StatusFilter = typeof STATUS_OPTIONS[number];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "cost", label: "Highest cost" },
  { value: "iterations", label: "Most iterations" },
] as const;
type SortOption = typeof SORT_OPTIONS[number]["value"];

export default function SprintsPage() {
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const { data: sprints } = usePolling<SprintSummary[]>("/api/sprints", 10000);
  const { data: projects } = usePolling<Project[]>("/api/projects", 30000);

  const allSprints = sprints || [];
  const allProjects = projects || [];

  // Unique agent names from sprint data
  const agentOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of allSprints) {
      if (s.agentConfig?.generator) {
        const { agentId, agentName } = s.agentConfig.generator;
        if (!seen.has(agentId)) seen.set(agentId, agentName);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [allSprints]);

  // Status counts (before status filter, after other filters)
  const statusCounts = useMemo(() => {
    const base = allSprints.filter((s) => {
      if (projectFilter !== "all" && (s.projectId || null) !== (projectFilter === "none" ? null : projectFilter)) return false;
      if (searchText && !s.name.toLowerCase().includes(searchText.toLowerCase())) return false;
      if (agentFilter !== "all" && s.agentConfig?.generator?.agentId !== agentFilter) return false;
      return true;
    });
    const counts: Record<StatusFilter, number> = { All: base.length, Draft: 0, Running: 0, Passed: 0, Failed: 0 };
    for (const s of base) {
      if (s.status === "draft") counts.Draft++;
      else if (s.status === "running") counts.Running++;
      else if (s.status === "passed") counts.Passed++;
      else if (s.status === "failed") counts.Failed++;
    }
    return counts;
  }, [allSprints, projectFilter, searchText, agentFilter]);

  // Apply all filters + sort
  const filteredSprints = useMemo(() => {
    let result = allSprints.filter((s) => {
      if (projectFilter !== "all" && (s.projectId || null) !== (projectFilter === "none" ? null : projectFilter)) return false;
      if (searchText && !s.name.toLowerCase().includes(searchText.toLowerCase())) return false;
      if (statusFilter !== "All") {
        const statusMap: Record<StatusFilter, string> = { All: "", Draft: "draft", Running: "running", Passed: "passed", Failed: "failed" };
        if (s.status !== statusMap[statusFilter]) return false;
      }
      if (agentFilter !== "all" && s.agentConfig?.generator?.agentId !== agentFilter) return false;
      return true;
    });

    if (sortBy === "newest") result = [...result].reverse();
    else if (sortBy === "oldest") result = [...result];
    else if (sortBy === "cost") result = [...result].sort((a, b) => b.totalCost - a.totalCost);
    else if (sortBy === "iterations") result = [...result].sort((a, b) => b.iterations - a.iterations);

    return result;
  }, [allSprints, projectFilter, searchText, statusFilter, agentFilter, sortBy]);

  const isFiltered = searchText || statusFilter !== "All" || agentFilter !== "all" || projectFilter !== "all";

  const selectStyle = {
    background: "#14151b",
    border: "1px solid #1c1d26",
    borderRadius: "8px",
    padding: "7px 10px",
    color: "#e0e0e8",
    fontSize: "12px",
    cursor: "pointer",
    outline: "none",
  };

  return (
    <div style={{ padding: "32px", maxWidth: "1000px" }}>
      {/* Page header */}
      <div style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div>
            <h1 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 700, color: "#e0e0e8" }}>Sprints</h1>
            <div style={{ fontSize: "13px", color: "#9ca3af" }}>
              {filteredSprints.length} sprint{filteredSprints.length !== 1 ? "s" : ""}
              {isFiltered && " (filtered)"}
            </div>
          </div>
          <Link
            href="/sprints/compare"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "7px 13px",
              borderRadius: "7px",
              border: "1px solid #1c1d26",
              background: "transparent",
              color: "#9ca3af",
              fontSize: "12px",
              fontWeight: 500,
              textDecoration: "none",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            ⇄ Compare
          </Link>
        </div>

        {/* Project filter */}
        {allProjects.length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={() => setProjectFilter("all")}
              style={{
                padding: "7px 14px",
                borderRadius: "7px",
                border: "1px solid",
                borderColor: projectFilter === "all" ? "#fb923c" : "var(--border)",
                background: projectFilter === "all" ? "rgba(20,184,166,0.12)" : "transparent",
                color: projectFilter === "all" ? "#fb923c" : "#9ca3af",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
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
                    borderColor: active ? accent.color : "#1c1d26",
                    background: active ? `${accent.color}18` : "transparent",
                    color: active ? accent.color : "#9ca3af",
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

      {/* Filter bar */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "12px",
        alignItems: "center",
        marginBottom: "20px",
        padding: "14px 16px",
        background: "#0f1116",
        border: "1px solid #1c1d26",
        borderRadius: "10px",
      }}>
        {/* Search */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <Search size={14} style={{
            position: "absolute",
            left: "10px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "#555565",
            pointerEvents: "none",
          }} />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search sprints..."
            style={{
              background: "#14151b",
              border: "1px solid #1c1d26",
              borderRadius: "8px",
              padding: "8px 32px 8px 32px",
              color: "#e0e0e8",
              fontSize: "13px",
              width: "280px",
              outline: "none",
            }}
          />
          {searchText && (
            <button
              onClick={() => setSearchText("")}
              style={{
                position: "absolute",
                right: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                padding: "2px",
                cursor: "pointer",
                color: "#555565",
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Status filter */}
        <div style={{ display: "flex", gap: "4px" }}>
          {STATUS_OPTIONS.map((status) => {
            const active = statusFilter === status;
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid",
                  borderColor: active ? "var(--accent)" : "#1c1d26",
                  background: active ? "var(--accent-glow)" : "transparent",
                  color: active ? "var(--accent)" : "#9ca3af",
                  fontSize: "12px",
                  fontWeight: active ? 600 : 400,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {status}
                <span style={{
                  marginLeft: "5px",
                  fontSize: "11px",
                  opacity: 0.75,
                }}>
                  {statusCounts[status]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Agent filter */}
        {agentOptions.length > 1 && (
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="all">All agents</option>
            {agentOptions.map(({ id, name }) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          style={{ ...selectStyle, marginLeft: "auto" }}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {filteredSprints.length === 0 ? (
        <div style={{
          background: "#0f1116",
          border: "1px solid #1c1d26",
          borderRadius: "12px",
          padding: "48px",
          textAlign: "center",
          color: "#9ca3af",
        }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>⚡</div>
          <div style={{ fontSize: "16px", fontWeight: 600, color: "#e0e0e8", marginBottom: "6px" }}>
            {isFiltered ? "No matching sprints" : "No sprints yet"}
          </div>
          <div style={{ fontSize: "13px", marginBottom: "16px" }}>
            {isFiltered ? "Try adjusting your filters." : "Run your first sprint to get started."}
          </div>
          {!isFiltered && (
            <code style={{ background: "var(--card-elevated)", border: "1px solid var(--border)", borderRadius: "6px", padding: "6px 12px", fontSize: "13px", color: "#fb923c", fontWeight: 600 }}>
              mah run
            </code>
          )}
        </div>
      ) : (
        <div style={{ background: "#0f1116", border: "1px solid #1c1d26", borderRadius: "12px", overflow: "hidden" }}>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 140px 120px 80px 80px 100px",
            gap: "12px",
            padding: "12px 20px",
            borderBottom: "1px solid #1c1d26",
            fontSize: "11px",
            color: "#9ca3af",
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
          {filteredSprints.map((sprint, i) => (
            <Link
              key={sprint.id}
              href={`/sprints/${sprint.id}`}
              style={{
                display: "grid",
                gridTemplateColumns: "60px 1fr 140px 120px 80px 80px 100px",
                gap: "12px",
                padding: "13px 20px",
                borderBottom: i < filteredSprints.length - 1 ? "1px solid #1e1e2e" : "none",
                textDecoration: "none",
                color: "inherit",
                alignItems: "center",
                transition: "background 0.15s",
              }}
              className="sprint-row"
            >
              <div style={{ fontSize: "12px", color: "#9ca3af", fontFamily: "monospace" }}>
                #{sprint.id}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  {sprint.status === "scheduled" && <span title="Scheduled">🕐</span>}
                  {sprint.status === "running" && <div className="dot-pulse" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#fb923c", flexShrink: 0 }} />}
                  {sprint.status === "queued" && <span title="Queued">⏳</span>}
                  <span style={{ fontSize: "14px", color: "#e0e0e8", fontWeight: 500 }}>{sprint.name}</span>
                  {sprint.iterations > 0 && (
                    <span style={{
                      fontSize: "10px",
                      color: sprint.iterations > 1 ? "#eab308" : "#22c55e",
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
              <div style={{ fontSize: "12px", color: "#9ca3af" }}>
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
              <div style={{ fontSize: "13px", color: "#fb923c", fontWeight: 600 }}>
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
