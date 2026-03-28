import Link from "next/link";
import MetricsCard from "@/components/MetricsCard";
import VerdictBadge from "@/components/VerdictBadge";
import type { SprintSummary, MahConfig } from "@/types/mah";

async function getStats() {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3333";
  const res = await fetch(`${base}/api/stats`, { cache: "no-store" });
  return res.json();
}

async function getSprints(): Promise<SprintSummary[]> {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3333";
  const res = await fetch(`${base}/api/sprints`, { cache: "no-store" });
  return res.json();
}

async function getConfig(): Promise<MahConfig> {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3333";
  const res = await fetch(`${base}/api/config`, { cache: "no-store" });
  return res.json();
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
                transition: "opacity 0.15s",
              }}
            />
            <div style={{ fontSize: "10px", color: "#888898" }}>#{sprint.id}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const [stats, sprints, config] = await Promise.all([getStats(), getSprints(), getConfig()]);
  const recentSprints = (sprints || []).slice(-5).reverse();
  const priorities = config?.priorities ? priorityOrder(config.priorities) : [];

  return (
    <div style={{ padding: "32px", maxWidth: "1100px" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
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

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px", marginBottom: "32px" }}>
        <MetricsCard label="Total Sprints" value={stats.totalSprints ?? 0} />
        <MetricsCard label="Pass Rate" value={`${stats.passRate ?? 0}%`} accent="#22c55e" />
        <MetricsCard label="Avg Iterations" value={stats.avgIterations ?? 0} />
        <MetricsCard label="Total Cost" value={`$${(stats.totalCost ?? 0).toFixed(2)}`} accent="#7c3aed" />
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
          {stats.costPerSprint && stats.costPerSprint.length > 0 ? (
            <CostChart data={stats.costPerSprint} />
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
