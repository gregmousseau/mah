"use client";

import Link from "next/link";
import { useState } from "react";
import MetricsCard from "@/components/MetricsCard";
import VerdictBadge from "@/components/VerdictBadge";
import ActiveSprint from "@/components/ActiveSprint";
import AnimatedNumber from "@/components/AnimatedNumber";
import SprintTimelineChart from "@/components/SprintTimelineChart";
import AgentConfig from "@/components/AgentConfig";
import Toast from "@/components/Toast";
import { usePolling } from "@/hooks/usePolling";
import { PlusSquare, Clock, FileText, Radio } from "lucide-react";
import type { SprintSummary, MahConfig, Project } from "@/types/mah";
import type { AgentDefinition } from "@/lib/agents";

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

function getProjectAccent(projectId?: string | null): string {
  if (projectId === "w-construction") return "#eab308";
  if (projectId === "mah-build") return "#fb923c";
  if (!projectId) return "#555565";
  const hash = (projectId || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return `hsl(${hash % 360}, 70%, 65%)`;
}

export default function DashboardPage() {
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const { data: stats } = usePolling<Stats>("/api/stats", 10000);
  const { data: allSprints } = usePolling<SprintSummary[]>("/api/sprints", 10000);
  const { data: config } = usePolling<MahConfig>("/api/config", 60000);
  const { data: projects } = usePolling<Project[]>("/api/projects", 30000);
  const { data: drafts } = usePolling<Record<string, unknown>[]>("/api/builder/drafts", 15000);
  const { data: agentsData, refetch: refetchAgents } = usePolling<{ agents: AgentDefinition[] }>("/api/agents", 30000);

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

  // Quick stats
  const runningCount = (allSprints || []).filter((s) => s.status === "running").length;
  const queuedCount = (allSprints || []).filter((s) => s.status === "queued").length;
  const draftCount2 = (allSprints || []).filter((s) => s.status === "draft" || s.status === "approved").length;
  const activeSprint = (allSprints || []).find((s) => s.status === "running");

  // Add agent handler
  const handleAddAgent = async (data: { name: string; description: string; platform: string; skills: string; contextFolders: string }) => {
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          role: data.description,
          platform: data.platform,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create agent");
      }

      const result = await response.json();
      setToast({
        message: `Agent configuration sprint created: ${result.sprintDir}`,
        type: "success",
      });
      refetchAgents();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to create agent configuration sprint",
        type: "error",
      });
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: "32px", maxWidth: "1100px" }}>
        <div style={{ marginBottom: "24px" }}>
          <div style={{ height: "28px", width: "200px", background: "#0f1116", borderRadius: "6px", marginBottom: "8px" }} className="skeleton" />
          <div style={{ height: "14px", width: "300px", background: "#0f1116", borderRadius: "4px" }} className="skeleton" />
        </div>
        <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ background: "#0f1116", border: "1px solid #1c1d26", borderRadius: "12px", padding: "20px 24px", height: "88px" }} className="skeleton" />
          ))}
        </div>
        <div className="two-col-layout" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          <div style={{ background: "#0f1116", border: "1px solid #1c1d26", borderRadius: "12px", height: "240px" }} className="skeleton" />
          <div style={{ background: "#0f1116", border: "1px solid #1c1d26", borderRadius: "12px", height: "240px" }} className="skeleton" />
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
              background: "rgba(251, 146, 60, 0.12)",
              color: "#fb923c",
              border: "1px solid rgba(251, 146, 60, 0.25)",
              borderRadius: "6px",
              padding: "2px 8px",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.02em",
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
              padding: "9px 18px",
              background: "linear-gradient(135deg, #fb923c, #f97316)",
              borderRadius: "8px",
              textDecoration: "none",
              color: "white",
              fontSize: "13px",
              fontWeight: 600,
              flexShrink: 0,
              boxShadow: "0 2px 8px rgba(251, 146, 60, 0.25)",
              transition: "all 0.2s ease",
            }}
          >
            <PlusSquare size={15} strokeWidth={2.5} />
            New Sprint
          </Link>
        </div>
        {priorities.length > 0 && (
          <div style={{ fontSize: "13px", color: "#9ca3af", display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {priorities.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </div>
        )}
      </div>

      {/* Quick stats bar */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        {[
          { label: "Running", value: runningCount, color: runningCount > 0 ? "#fb923c" : "#555565", active: runningCount > 0, href: "/live" },
          { label: "Queued", value: queuedCount, color: queuedCount > 0 ? "#10b981" : "#555565", active: false, href: "/sprints" },
          { label: "Drafts", value: draftCount2, color: draftCount2 > 0 ? "#eab308" : "#555565", active: false, href: "/sprints" },
        ].map(({ label, value, color, active, href }) => (
          <Link
            key={label}
            href={href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              background: active ? `${color}18` : "transparent",
              border: `1px solid ${active ? `${color}40` : "#1c1d26"}`,
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "12px",
              color: "#9ca3af",
              transition: "all 0.15s",
            }}
          >
            {active && <div className="dot-pulse" style={{ width: "6px", height: "6px", borderRadius: "50%", background: color }} />}
            <span style={{ color, fontWeight: 600 }}>{value}</span>
            <span>{label}</span>
          </Link>
        ))}
      </div>

      {/* Active sprint banner */}
      {activeSprint && (
        <Link
          href="/live"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            padding: "14px 20px",
            background: "rgba(251, 146, 60, 0.08)",
            border: "1px solid rgba(251, 146, 60, 0.3)",
            borderRadius: "12px",
            marginBottom: "20px",
            textDecoration: "none",
            transition: "all 0.2s ease",
          }}
        >
          <div className="dot-pulse" style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#fb923c", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#e6e8f0" }}>
              Sprint running: {activeSprint.name}
            </div>
            <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>Click to watch live</div>
          </div>
          <Radio size={16} color="#fb923c" />
        </Link>
      )}

      {/* Project selector */}
      {projects && projects.length > 0 && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
          <button
            onClick={() => setProjectFilter(null)}
            style={{
              padding: "7px 16px",
              borderRadius: "8px",
              border: "1px solid",
              borderColor: !projectFilter ? "#fb923c" : "#1c1d26",
              background: !projectFilter ? "rgba(251, 146, 60, 0.12)" : "transparent",
              color: !projectFilter ? "#fb923c" : "#9ca3af",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
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
                  padding: "7px 16px",
                  borderRadius: "8px",
                  border: "1px solid",
                  borderColor: active ? accentColor : "#1c1d26",
                  background: active ? `${accentColor}15` : "transparent",
                  color: active ? accentColor : "#9ca3af",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.2s ease",
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
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "22px 24px" }} className="metrics-card">
          <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "10px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Total Sprints</div>
          <AnimatedNumber value={s.totalSprints} style={{ fontSize: "34px", fontWeight: 700, color: "#e6e8f0", letterSpacing: "-0.02em" }} />
        </div>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "22px 24px" }} className="metrics-card">
          <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "10px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Pass Rate</div>
          <AnimatedNumber value={s.passRate} format={(n) => `${Math.round(n)}%`} style={{ fontSize: "34px", fontWeight: 700, color: "#22c55e", letterSpacing: "-0.02em" }} />
        </div>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "22px 24px" }} className="metrics-card">
          <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "10px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Avg Iterations</div>
          <AnimatedNumber value={s.avgIterations} format={(n) => n.toFixed(1)} style={{ fontSize: "34px", fontWeight: 700, color: "#e6e8f0", letterSpacing: "-0.02em" }} />
        </div>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "22px 24px" }} className="metrics-card">
          <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "10px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Total Cost</div>
          <AnimatedNumber value={s.totalCost} format={(n) => `$${n.toFixed(2)}`} style={{ fontSize: "34px", fontWeight: 700, color: "#fb923c", letterSpacing: "-0.02em" }} />
        </div>
      </div>

      {/* Two-column layout */}
      <div className="two-col-layout" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* Recent Sprints */}
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#e6e8f0" }}>Recent Sprints</h2>
            <Link href="/sprints" style={{ fontSize: "12px", color: "#fb923c", textDecoration: "none", fontWeight: 600 }}>View all →</Link>
          </div>

          {recentSprints.length === 0 ? (
            <div style={{ color: "#9ca3af", fontSize: "14px", padding: "16px 0" }}>
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
                    padding: "12px 14px",
                    background: "var(--card-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    textDecoration: "none",
                    transition: "all 0.2s ease",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                  className="sprint-link"
                >
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "#e0e0e8" }}>
                      #{sprint.id} {sprint.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>
                      {sprint.createdAt ? formatDate(sprint.createdAt) : "—"} · {sprint.iterations} iter · ${sprint.totalCost.toFixed(2)}
                    </div>
                  </div>
                  <VerdictBadge verdict={sprint.verdict} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Sprint Timeline Chart */}
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px" }}>
          <h2 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 700, color: "#e6e8f0" }}>Sprint Timeline</h2>
          <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>Cost over time by project</div>
          {sprints.length > 0 ? (
            <SprintTimelineChart sprints={sprints} getProjectAccent={getProjectAccent} />
          ) : (
            <div style={{ color: "#9ca3af", fontSize: "14px", padding: "24px 0" }}>No data yet.</div>
          )}
        </div>
      </div>

      {/* Project breakdown */}
      {!projectFilter && projects && projects.length > 0 && (
        <div style={{ marginTop: "24px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#e6e8f0" }}>Projects</h2>
            <Link href="/projects" style={{ fontSize: "12px", color: "#fb923c", textDecoration: "none", fontWeight: 600 }}>View all →</Link>
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
                      background: "var(--card-elevated)",
                      border: `1px solid var(--border)`,
                      borderRadius: "10px",
                      padding: "18px",
                      cursor: "pointer",
                      position: "relative",
                      overflow: "hidden",
                      transition: "all 0.25s ease",
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
        <div style={{ marginTop: "24px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#e6e8f0" }}>
              Drafts & Scheduled
              <span style={{
                marginLeft: "8px",
                background: "#fb923c",
                color: "white",
                fontSize: "10px",
                fontWeight: 700,
                borderRadius: "10px",
                padding: "2px 8px",
              }}>
                {drafts.length}
              </span>
            </h2>
            <Link href="/builder" style={{ fontSize: "12px", color: "#fb923c", textDecoration: "none", fontWeight: 600 }}>
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
                    padding: "14px 16px",
                    background: "var(--card-elevated)",
                    border: "1px solid var(--border)",
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
                        <FileText size={13} color="#9ca3af" />
                      )}
                      <span style={{ fontSize: "13px", fontWeight: 500, color: "#e0e0e8" }}>{name || id}</span>
                      <span style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        borderRadius: "5px",
                        padding: "3px 8px",
                        background: status === "scheduled" ? "rgba(16, 185, 129, 0.12)" : status === "approved" ? "rgba(251, 146, 60, 0.12)" : "rgba(85,85,101,0.1)",
                        color: status === "scheduled" ? "#10b981" : status === "approved" ? "#fb923c" : "#9ca3af",
                        border: `1px solid ${status === "scheduled" ? "rgba(16, 185, 129, 0.25)" : status === "approved" ? "rgba(251, 146, 60, 0.25)" : "rgba(85,85,101,0.25)"}`,
                        letterSpacing: "0.03em",
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
                        padding: "6px 14px",
                        background: "rgba(251, 146, 60, 0.1)",
                        border: "1px solid rgba(251, 146, 60, 0.25)",
                        borderRadius: "7px",
                        color: "#fb923c",
                        textDecoration: "none",
                        fontWeight: 600,
                        transition: "all 0.2s ease",
                      }}
                    >
                      Resume
                    </Link>
                    <button
                      onClick={async () => {
                        const saveRes = await fetch("/api/builder/save", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ contract: { ...draft, status: "approved" } }),
                        });
                        if (saveRes.ok) {
                          await fetch("/api/sprints/run", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ contractId: id }),
                          });
                          window.location.href = "/live";
                        }
                      }}
                      style={{
                        fontSize: "12px",
                        padding: "6px 14px",
                        background: "linear-gradient(135deg, #fb923c, #f97316)",
                        border: "none",
                        borderRadius: "7px",
                        color: "white",
                        cursor: "pointer",
                        fontWeight: 600,
                        boxShadow: "0 2px 8px rgba(251, 146, 60, 0.25)",
                        transition: "all 0.2s ease",
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

      {/* Agent Config */}
      {agentsData?.agents && (
        <AgentConfig agents={agentsData.agents} onAddAgent={handleAddAgent} />
      )}

      {/* Toast Notification */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
