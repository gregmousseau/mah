"use client";

import Link from "next/link";
import { useState } from "react";
import MetricsCard from "@/components/MetricsCard";
import VerdictBadge from "@/components/VerdictBadge";
import ActiveSprint from "@/components/ActiveSprint";
import AnimatedNumber from "@/components/AnimatedNumber";
import { usePolling } from "@/hooks/usePolling";
import { PlusSquare, Clock, FileText } from "lucide-react";
import type { SprintSummary, MahConfig, Project } from "@/types/mah";

interface Stats {
  totalSprints: number;
  passRate: number;
  avgIterations: number;
  totalCost: number;
  costPerSprint: { id: string; name: string; cost: number; date: string }[];
}

function priorityOrder(p: Record<string, number>) {
  const medals = ["🥇", "🥈", "🥉"];
  const sorted = Object.entries(p).sort((a, b) => a[1] - b[1]);
  return sorted.map(([key], i) => `${medals[i]} ${key.charAt(0).toUpperCase() + key.slice(1)}`);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function CostChart({ data }: { data: { id: string; name: string; cost: number }[] }) {
  if (!data || data.length === 0) return null;
  const maxCost = Math.max(...data.map((d) => d.cost), 0.01);

  return (
    <div style={{ padding: "20px 0 8px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", height: "80px" }}>
        {data.map((sprint) => (
          <div key={sprint.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
            <div style={{ fontSize: "10px", color: "#888898" }}>${sprint.cost.toFixed(2)}</div>
            <div
              style={{
                width: "100%",
                maxWidth: "60px",
                height: `${Math.max((sprint.cost / maxCost) * 56, 4)}px`,
                background: "linear-gradient(180deg, #7c3aed, #a855f7)",
                borderRadius: "4px 4px 2px 2px",
                transition: "height 0.4s ease",
              }}
            />
            <div style={{ fontSize: "10px", color: "#888898" }}>#{sprint.id}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getProjectAccent(projectId?: string | null): string {
  if (projectId === "w-construction") return "#f59e0b";
  if (projectId === "mah-build") return "#a855f7";
  if (!projectId) return "#555565";
  const hash = (projectId || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return `hsl(${hash % 360}, 70%, 65%)`;
}

export default function DashboardPage() {
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const { data: stats } = usePolling<Stats>("/api/stats", 10000);
  const { data: allSprints } = usePolling<SprintSummary[]>("/api/sprints", 10000);
  const { data: config } = usePolling<MahConfig>("/api/config", 60000);
  const { data: projects } = usePolling<Project[]>("/api/projects", 30000);
  const { data: drafts } = usePolling<Record<string, unknown>[]>("/api/builder/drafts", 15000);

  const sprints = projectFilter
    ? (allSprints || []).filter((s) => s.projectId === projectFilter)
    : (allSprints || []);

  const recentSprints = sprints.slice().reverse();
  const priorities = config?.priorities ? priorityOrder(config.priorities) : [];

  // Compute filtered stats
  const filteredPassRate = sprints.length > 0
    ? Math.round((sprints.filter((s) => s.verdict === "pass" || s.status === "passed").length / sprints.length) * 100)
    : 0;
  const filteredAvgIter = sprints.length > 0
    ? sprints.reduce((sum, s) => sum + (s.iterations || 0), 0) / sprints.length
    : 0;
  const filteredCost = sprints.reduce((sum, s) => sum + (s.totalCost || 0), 0);
  const filteredCostPerSprint = sprints.map((s) => ({ id: s.id, name: s.name, cost: s.totalCost }));

  const s = projectFilter
    ? { totalSprints: sprints.length, passRate: filteredPassRate, avgIterations: filteredAvgIter, totalCost: filteredCost, costPerSprint: filteredCostPerSprint }
    : stats || { totalSprints: 0, passRate: 0, avgIterations: 0, totalCost: 0, costPerSprint: [] };

  const isLoading = !stats && !allSprints;

  if (isLoading) {
    return (
      <div style={{ padding: "32px", maxWidth: "1100px" }}>
        <div style={{ marginBottom: "24px" }}>
          <div style={{ height: "28px", width: "200px", background: "#141420", borderRadius: "6px", marginBottom: "8px" }} className="skeleton" />
          <div style={{ height: "14px", width: "300px", background: "#141420", borderRadius: "4px" }} className="skeleton" />
        </div>
        <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ background: "#141420", border: "1px solid #2a2a3a", borderRadius: "12px", padding: "20px 24px", height: "88px" }} className="skeleton" />
          ))}
        </div>
        <div className="two-col-layout" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          <div style={{ background: "#141420", border: "1px solid #2a2a3a", borderRadius: "12px", height: "240px" }} className="skeleton" />
          <div style={{ background: "#141420", border: "1px solid #2a2a3a", borderRadius: "12px", height: "240px" }} className="skeleton" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", maxWidth: "1100px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "8px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "#e0e0e8" }}>
              {config?.project?.name || "MAH Project"}
            </h1>
            <span style={{
              background: "rgba(124, 58, 237, 0.15)",
              color: "#a855f7",
              border: "1px solid rgba(168, 85, 247, 0.3)",
              borderRadius: "6px",
              padding: "2px 8px",
              fontSize: "12px",
              fontWeight: 500,
            }}>
              Multi-Agent Harness
            </span>
          </div>
          <Link
            href="/builder"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              padding: "8px 16px",
              background: "linear-gradient(135deg, #7c3aed, #a855f7)",
              borderRadius: "8px",
              textDecoration: "none",
              color: "white",
              fontSize: "13px",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            <PlusSquare size={15} />
            New Sprint
          </Link>
        </div>
        {priorities.length > 0 && (
          <div style={{ fontSize: "13px", color: "#888898", display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {priorities.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </div>
        )}
      </div>

      {/* Project selector */}
      {projects && projects.length > 0 && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
          <button
            onClick={() => setProjectFilter(null)}
            style={{
              padding: "6px 14px",
              borderRadius: "8px",
              border: "1px solid",
              borderColor: !projectFilter ? "#7c3aed" : "#2a2a3a",
              background: !projectFilter ? "rgba(124,58,237,0.15)" : "transparent",
              color: !projectFilter ? "#a855f7" : "#888898",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            All Projects
          </button>
          {projects.map((project) => {
            const accentColor = getProjectAccent(project.id);
            const active = projectFilter === project.id;
            return (
              <button
                key={project.id}
                onClick={() => setProjectFilter(active ? null : project.id)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: "1px solid",
                  borderColor: active ? accentColor : "#2a2a3a",
                  background: active ? `${accentColor}18` : "transparent",
                  color: active ? accentColor : "#888898",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.15s",
                }}
              >
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: accentColor, display: "inline-block" }} />
                {project.name}
                <span style={{ fontSize: "11px", opacity: 0.7 }}>({project.sprintCount})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Active sprint indicator */}
      <div style={{ marginBottom: "28px" }}>
        <ActiveSprint />
      </div>

      {/* Stats grid */}
      <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
        <div style={{ background: "#141420", border: "1px solid #2a2a3a", borderRadius: "12px", padding: "20px 24px" }} className="metrics-card">
          <div style={{ fontSize: "12px", color: "#888898", marginBottom: "8px", letterSpacing: "0.05em", textTransform: "uppercase" }}>Total Sprints</div>
          <AnimatedNumber value={s.totalSprints} style={{ fontSize: "32px", fontWeight: 700, color: "#e0e0e8" }} />
        </div>
        <div style={{ background: "#141420", border: "1px solid #2a2a3a", borderRadius: "12px", padding: "20px 24px" }} className="metrics-card">
          <div style={{ fontSize: "12px", color: "#888898", marginBottom: "8px", letterSpacing: "0.05em", textTransform: "uppercase" }}>Pass Rate</div>
          <AnimatedNumber value={s.passRate} format={(n) => `${Math.round(n)}%`} style={{ fontSize: "32px", fontWeight: 700, color: "#22c55e" }} />
        </div>
        <div style={{ background: "#141420", border: "1px solid #2a2a3a", borderRadius: "12px", padding: "20px 24px" }} className="metrics-card">
          <div style={{ fontSize: "12px", color: "#888898", marginBottom: "8px", letterSpacing: "0.05em", textTransform: "uppercase" }}>Avg Iterations</div>
          <AnimatedNumber value={s.avgIterations} format={(n) => n.toFixed(1)} style={{ fontSize: "32px", fontWeight: 700, color: "#e0e0e8" }} />
        </div>
        <div style={{ background: "#141420", border: "1px solid #2a2a3a", borderRadius: "12px", padding: "20px 24px" }} className="metrics-card">
          <div style={{ fontSize: "12px", color: "#888898", marginBottom: "8px", letterSpacing: "0.05em", textTransform: "uppercase" }}>Total Cost</div>
          <AnimatedNumber value={s.totalCost} format={(n) => `$${n.toFixed(2)}`} style={{ fontSize: "32px", fontWeight: 700, color: "#7c3aed" }} />
        </div>
      </div>

      {/* Two-column layout */}
      <div className="two-col-layout" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* Recent Sprints */}
        <div style={{ background: "#141420", border: "1px solid #2a2a3a", borderRadius: "12px", padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "#e0e0e8" }}>Recent Sprints</h2>
            <Link href="/sprints" style={{ fontSize: "12px", color: "#7c3aed", textDecoration: "none" }}>View all →</Link>
          </div>

          {recentSprints.length === 0 ? (
            <div style={{ color: "#888898", fontSize: "14px", padding: "16px 0" }}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>⚡</div>
              <div style={{ fontWeight: 500, color: "#e0e0e8", marginBottom: "4px" }}>No sprints yet</div>
              <div style={{ fontSize: "12px" }}>Run your first sprint with <code style={{ background: "#0d0d18", padding: "1px 5px", borderRadius: "4px" }}>mah run</code></div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {recentSprints.map((sprint) => (
                <Link
                  key={sprint.id}
                  href={`/sprints/${sprint.id}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 12px",
                    background: "#0d0d18",
                    border: "1px solid #2a2a3a",
                    borderRadius: "8px",
                    textDecoration: "none",
                    transition: "border-color 0.15s",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                  className="sprint-link"
                >
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "#e0e0e8" }}>
                      #{sprint.id} {sprint.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "#888898", marginTop: "2px" }}>
                      {sprint.createdAt ? formatDate(sprint.createdAt) : "—"} · {sprint.iterations} iter · ${sprint.totalCost.toFixed(2)}
                    </div>
                  </div>
                  <VerdictBadge verdict={sprint.verdict} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Cost chart */}
        <div style={{ background: "#141420", border: "1px solid #2a2a3a", borderRadius: "12px", padding: "24px" }}>
          <h2 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 600, color: "#e0e0e8" }}>Cost per Sprint</h2>
          <div style={{ fontSize: "12px", color: "#888898", marginBottom: "4px" }}>Estimated API cost</div>
          {s.costPerSprint && s.costPerSprint.length > 0 ? (
            <CostChart data={s.costPerSprint} />
          ) : (
            <div style={{ color: "#888898", fontSize: "14px", padding: "24px 0" }}>No data yet.</div>
          )}
        </div>
      </div>

      {/* Project breakdown */}
      {!projectFilter && projects && projects.length > 0 && (
        <div style={{ marginTop: "24px", background: "#141420", border: "1px solid #2a2a3a", borderRadius: "12px", padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "#e0e0e8" }}>Projects</h2>
            <Link href="/projects" style={{ fontSize: "12px", color: "#7c3aed", textDecoration: "none" }}>View all →</Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
            {projects.map((project) => {
              const accentColor = getProjectAccent(project.id);
              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  style={{ textDecoration: "none" }}
                >
                  <div
                    style={{
                      background: "#0d0d18",
                      border: `1px solid #2a2a3a`,
                      borderRadius: "10px",
                      padding: "16px",
                      cursor: "pointer",
                      position: "relative",
                      overflow: "hidden",
                      transition: "border-color 0.15s",
                    }}
                    className="project-mini-card"
                  >
                    <div style={{
                      position: "absolute",
                      left: 0, top: 0, bottom: 0,
                      width: "3px",
                      background: accentColor,
                      borderRadius: "10px 0 0 10px",
                    }} />
                    <div style={{ paddingLeft: "8px" }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e8", marginBottom: "8px" }}>
                        {project.name}
                      </div>
                      <div style={{ display: "flex", gap: "12px", fontSize: "12px" }}>
                        <div>
                          <span style={{ color: "#555565" }}>Sprints </span>
                          <span style={{ color: "#e0e0e8", fontWeight: 600 }}>{project.sprintCount ?? 0}</span>
                        </div>
                        <div>
                          <span style={{ color: "#555565" }}>Pass </span>
                          <span style={{ color: "#22c55e", fontWeight: 600 }}>{project.passRate ?? 0}%</span>
                        </div>
                        <div>
                          <span style={{ color: "#555565" }}>Cost </span>
                          <span style={{ color: accentColor, fontWeight: 600 }}>${(project.totalCost ?? 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Drafts section */}
      {drafts && drafts.length > 0 && (
        <div style={{ marginTop: "24px", background: "#141420", border: "1px solid #2a2a3a", borderRadius: "12px", padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "#e0e0e8" }}>
              Drafts & Scheduled
              <span style={{
                marginLeft: "8px",
                background: "#7c3aed",
                color: "white",
                fontSize: "10px",
                fontWeight: 700,
                borderRadius: "10px",
                padding: "1px 7px",
              }}>
                {drafts.length}
              </span>
            </h2>
            <Link href="/builder" style={{ fontSize: "12px", color: "#7c3aed", textDecoration: "none" }}>
              + New Sprint
            </Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {drafts.map((draft) => {
              const id = draft.id as string;
              const name = draft.name as string;
              const status = draft.status as string;
              const scheduledFor = draft.scheduledFor as string | undefined;
              const task = draft.task as string;
              return (
                <div
                  key={id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    background: "#0d0d18",
                    border: "1px solid #2a2a3a",
                    borderRadius: "8px",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                      {status === "scheduled" ? (
                        <Clock size={13} color="#60a5fa" />
                      ) : (
                        <FileText size={13} color="#888898" />
                      )}
                      <span style={{ fontSize: "13px", fontWeight: 500, color: "#e0e0e8" }}>{name || id}</span>
                      <span style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        borderRadius: "4px",
                        padding: "1px 6px",
                        background: status === "scheduled" ? "rgba(59,130,246,0.1)" : status === "approved" ? "rgba(124,58,237,0.1)" : "rgba(85,85,101,0.1)",
                        color: status === "scheduled" ? "#60a5fa" : status === "approved" ? "#a855f7" : "#888898",
                        border: `1px solid ${status === "scheduled" ? "rgba(59,130,246,0.25)" : status === "approved" ? "rgba(124,58,237,0.25)" : "rgba(85,85,101,0.25)"}`,
                      }}>
                        {status?.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#555565", paddingLeft: "21px" }}>
                      {scheduledFor ? `Scheduled for ${new Date(scheduledFor).toLocaleString()}` : (task as string || "").slice(0, 80)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                    <Link
                      href={`/builder?resume=${id}`}
                      style={{
                        fontSize: "12px",
                        padding: "5px 12px",
                        background: "rgba(124,58,237,0.1)",
                        border: "1px solid rgba(124,58,237,0.25)",
                        borderRadius: "6px",
                        color: "#a855f7",
                        textDecoration: "none",
                        fontWeight: 500,
                      }}
                    >
                      Resume
                    </Link>
                    <button
                      onClick={async () => {
                        await fetch("/api/builder/save", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ contract: { ...draft, status: "approved" } }),
                        });
                        window.location.reload();
                      }}
                      style={{
                        fontSize: "12px",
                        padding: "5px 12px",
                        background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                        border: "none",
                        borderRadius: "6px",
                        color: "white",
                        cursor: "pointer",
                        fontWeight: 500,
                      }}
                    >
                      Run Now
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Config summary */}
      {config?.agents && (
        <div style={{ marginTop: "24px", background: "#141420", border: "1px solid #2a2a3a", borderRadius: "12px", padding: "24px" }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: 600, color: "#e0e0e8" }}>Agent Config</h2>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            {Object.entries(config.agents).map(([name, agent]) => (
              <div
                key={name}
                style={{
                  background: "#0d0d18",
                  border: "1px solid #2a2a3a",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  minWidth: "140px",
                }}
              >
                <div style={{ fontSize: "11px", color: "#7c3aed", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{name}</div>
                <div style={{ fontSize: "13px", color: "#e0e0e8", marginTop: "4px" }}>{agent.model}</div>
                <div style={{ fontSize: "11px", color: "#888898", marginTop: "2px" }}>{agent.type}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
