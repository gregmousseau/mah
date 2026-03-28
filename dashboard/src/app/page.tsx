"use client";

import Link from "next/link";
import MetricsCard from "@/components/MetricsCard";
import VerdictBadge from "@/components/VerdictBadge";
import ActiveSprint from "@/components/ActiveSprint";
import AnimatedNumber from "@/components/AnimatedNumber";
import { usePolling } from "@/hooks/usePolling";
import type { SprintSummary, MahConfig } from "@/types/mah";

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

export default function DashboardPage() {
  const { data: stats } = usePolling<Stats>("/api/stats", 10000);
  const { data: sprints } = usePolling<SprintSummary[]>("/api/sprints", 10000);
  const { data: config } = usePolling<MahConfig>("/api/config", 60000);

  const recentSprints = (sprints || []).slice(-5).reverse();
  const priorities = config?.priorities ? priorityOrder(config.priorities) : [];
  const s = stats || { totalSprints: 0, passRate: 0, avgIterations: 0, totalCost: 0, costPerSprint: [] };

  return (
    <div style={{ padding: "32px", maxWidth: "1100px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
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
        {priorities.length > 0 && (
          <div style={{ fontSize: "13px", color: "#888898", display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {priorities.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </div>
        )}
      </div>

      {/* Active sprint indicator */}
      <div style={{ marginBottom: "28px" }}>
        <ActiveSprint />
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px", marginBottom: "32px" }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* Recent Sprints */}
        <div style={{ background: "#141420", border: "1px solid #2a2a3a", borderRadius: "12px", padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "#e0e0e8" }}>Recent Sprints</h2>
            <Link href="/sprints" style={{ fontSize: "12px", color: "#7c3aed", textDecoration: "none" }}>View all →</Link>
          </div>

          {recentSprints.length === 0 ? (
            <div style={{ color: "#888898", fontSize: "14px" }}>No sprints yet.</div>
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
