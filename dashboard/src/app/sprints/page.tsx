import Link from "next/link";
import VerdictBadge from "@/components/VerdictBadge";
import type { SprintSummary } from "@/types/mah";

async function getSprints(): Promise<SprintSummary[]> {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3333";
  const res = await fetch(`${base}/api/sprints`, { cache: "no-store" });
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

function formatDuration(start?: string, end?: string) {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  return `${mins}m`;
}

export default async function SprintsPage() {
  const sprints = await getSprints();

  return (
    <div style={{ padding: "32px", maxWidth: "900px" }}>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 700, color: "#e0e0e8" }}>Sprints</h1>
        <div style={{ fontSize: "13px", color: "#888898" }}>
          {sprints.length} sprint{sprints.length !== 1 ? "s" : ""} total
        </div>
      </div>

      {sprints.length === 0 ? (
        <div style={{
          background: "#141420",
          border: "1px solid #2a2a3a",
          borderRadius: "12px",
          padding: "40px",
          textAlign: "center",
          color: "#888898",
        }}>
          No sprints found. Run your first sprint to get started.
        </div>
      ) : (
        <div style={{ background: "#141420", border: "1px solid #2a2a3a", borderRadius: "12px", overflow: "hidden" }}>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 120px 80px 80px 100px",
            gap: "16px",
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
            <div>Date</div>
            <div>Iterations</div>
            <div>Cost</div>
            <div>Verdict</div>
          </div>

          {/* Rows */}
          {[...sprints].reverse().map((sprint, i) => (
            <Link
              key={sprint.id}
              href={`/sprints/${sprint.id}`}
              style={{
                display: "grid",
                gridTemplateColumns: "60px 1fr 120px 80px 80px 100px",
                gap: "16px",
                padding: "14px 20px",
                borderBottom: i < sprints.length - 1 ? "1px solid #1e1e2e" : "none",
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
                <div style={{ fontSize: "14px", color: "#e0e0e8", fontWeight: 500 }}>{sprint.name}</div>
              </div>
              <div style={{ fontSize: "12px", color: "#888898" }}>
                {sprint.createdAt ? formatDate(sprint.createdAt) : "—"}
                <div style={{ fontSize: "11px", color: "#555565", marginTop: "2px" }}>
                  {formatDuration(sprint.createdAt, sprint.completedAt)}
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
