"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import VerdictBadge from "@/components/VerdictBadge";
import { usePolling } from "@/hooks/usePolling";
import type { ProjectWithSprints } from "@/types/mah";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getProjectAccent(id: string): string {
  if (id === "w-construction") return "#eab308";
  if (id === "mah-build") return "#fb923c";
  const hash = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return `hsl(${hash % 360}, 70%, 65%)`;
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = usePolling<ProjectWithSprints>(`/api/projects/${id}`, 10000);

  useEffect(() => {
    if (data?.name) {
      document.title = `${data.name} | MAH`;
    }
    return () => { document.title = "MAH Dashboard"; };
  }, [data]);

  if (loading && !data) {
    return (
      <div style={{ padding: "32px", maxWidth: "900px" }}>
        <div style={{ height: "14px", width: "200px", background: "#0f1116", borderRadius: "4px", marginBottom: "24px" }} className="skeleton" />
        <div style={{ height: "32px", width: "300px", background: "#0f1116", borderRadius: "6px", marginBottom: "32px" }} className="skeleton" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "28px" }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ height: "76px", background: "#0f1116", borderRadius: "10px" }} className="skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: "32px" }}>
        <Link href="/projects" style={{ color: "#fb923c", textDecoration: "none", fontSize: "13px" }}>← Back to Projects</Link>
        <div style={{ marginTop: "24px", color: "#ef4444", fontSize: "14px" }}>Project not found.</div>
      </div>
    );
  }

  const accent = getProjectAccent(data.id);
  const stats = (data as ProjectWithSprints & { stats: { sprintCount: number; passRate: number; totalCost: number; avgIterations: number } }).stats;

  return (
    <div style={{ padding: "32px", maxWidth: "900px" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: "24px", fontSize: "13px", color: "#9ca3af" }}>
        <Link href="/projects" style={{ color: "#fb923c", textDecoration: "none" }}>Projects</Link>
        <span style={{ margin: "0 8px" }}>→</span>
        <span style={{ color: accent }}>{data.name}</span>
      </div>

      {/* Header */}
      <div style={{
        background: "#0f1116",
        border: "1px solid #1c1d26",
        borderRadius: "14px",
        padding: "28px",
        marginBottom: "24px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Accent bar */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "3px",
          background: accent,
          borderRadius: "14px 14px 0 0",
        }} />
        <div style={{ paddingTop: "4px" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: "24px", fontWeight: 700, color: "#e0e0e8" }}>
            {data.name}
          </h1>
          {data.description && (
            <p style={{ margin: "0 0 12px", fontSize: "14px", color: "#9ca3af", lineHeight: 1.5 }}>
              {data.description}
            </p>
          )}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "12px", color: "#555565" }}>
            {data.repo && (
              <span>
                Repo:{" "}
                <code style={{ background: "#0d0d18", padding: "1px 6px", borderRadius: "4px", color: "#9ca3af" }}>
                  {data.repo}
                </code>
              </span>
            )}
            <span>Created: {formatDate(data.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "28px" }}>
          {[
            { label: "Sprints", value: stats.sprintCount, color: "#e0e0e8" },
            { label: "Pass Rate", value: `${stats.passRate}%`, color: "#22c55e" },
            { label: "Total Cost", value: `$${stats.totalCost.toFixed(2)}`, color: accent },
            { label: "Avg Iterations", value: stats.avgIterations, color: "#e0e0e8" },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                background: "#0f1116",
                border: "1px solid #1c1d26",
                borderRadius: "10px",
                padding: "16px 18px",
              }}
            >
              <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
              <div style={{ fontSize: "26px", fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Sprint list */}
      <div style={{ marginBottom: "28px" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: 600, color: "#e0e0e8" }}>Sprints</h2>

        {(!data.sprints || data.sprints.length === 0) ? (
          <div style={{
            background: "#0f1116",
            border: "1px solid #1c1d26",
            borderRadius: "12px",
            padding: "32px",
            textAlign: "center",
            color: "#9ca3af",
            fontSize: "14px",
          }}>
            No sprints in this project yet.
          </div>
        ) : (
          <div style={{ background: "#0f1116", border: "1px solid #1c1d26", borderRadius: "12px", overflow: "hidden" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "60px 1fr 120px 80px 80px 100px",
              gap: "16px",
              padding: "10px 20px",
              borderBottom: "1px solid #1c1d26",
              fontSize: "11px",
              color: "#9ca3af",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}>
              <div>ID</div>
              <div>Sprint</div>
              <div>Date</div>
              <div>Iter</div>
              <div>Cost</div>
              <div>Verdict</div>
            </div>

            {[...data.sprints].reverse().map((sprint, i) => (
              <Link
                key={sprint.id}
                href={`/sprints/${sprint.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 1fr 120px 80px 80px 100px",
                  gap: "16px",
                  padding: "13px 20px",
                  borderBottom: i < data.sprints.length - 1 ? "1px solid #1e1e2e" : "none",
                  textDecoration: "none",
                  color: "inherit",
                  alignItems: "center",
                  transition: "background 0.15s",
                }}
                className="sprint-row"
              >
                <div style={{ fontSize: "12px", color: "#9ca3af", fontFamily: "monospace" }}>#{sprint.id}</div>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "#e0e0e8" }}>{sprint.name}</div>
                <div style={{ fontSize: "12px", color: "#9ca3af" }}>
                  {sprint.createdAt ? formatDate(sprint.createdAt) : "—"}
                </div>
                <div style={{ fontSize: "13px", color: "#e0e0e8", textAlign: "center" }}>{sprint.iterations || "—"}</div>
                <div style={{ fontSize: "13px", color: accent }}>${sprint.totalCost.toFixed(2)}</div>
                <div><VerdictBadge verdict={sprint.verdict} /></div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Project config */}
      {data.config && (
        <div style={{ background: "#0f1116", border: "1px solid #1c1d26", borderRadius: "12px", padding: "24px" }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: 600, color: "#e0e0e8" }}>Project Config</h2>
          <pre style={{
            margin: 0,
            fontSize: "12px",
            color: "#9ca3af",
            background: "#0d0d18",
            borderRadius: "8px",
            padding: "16px",
            overflow: "auto",
            whiteSpace: "pre-wrap",
          }}>
            {JSON.stringify(data.config, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
