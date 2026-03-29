"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import SprintTimeline from "@/components/SprintTimeline";
import DefectTable from "@/components/DefectTable";
import VerdictBadge from "@/components/VerdictBadge";
import SprintProgressBar from "@/components/SprintProgressBar";
import { usePolling } from "@/hooks/usePolling";
import type { SprintContract, SprintMetrics, Defect, Project } from "@/types/mah";

interface SprintData {
  contract: SprintContract;
  metrics: SprintMetrics;
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "28px" }}>
      <h2 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: 600, color: "#e0e0e8" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function SprintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = usePolling<SprintData>(`/api/sprints/${id}`, 5000);
  const { data: projects } = usePolling<Project[]>("/api/projects", 60000);

  // Dynamic page title
  useEffect(() => {
    if (data?.contract) {
      document.title = `Sprint #${data.contract.id} — ${data.contract.name} | MAH`;
    } else {
      document.title = "Sprint | MAH Dashboard";
    }
    return () => { document.title = "MAH Dashboard"; };
  }, [data]);

  if (loading && !data) {
    return (
      <div style={{ padding: "32px", maxWidth: "900px" }}>
        <div style={{ height: "14px", width: "160px", background: "#141420", borderRadius: "4px", marginBottom: "24px" }} className="skeleton" />
        <div style={{ height: "32px", width: "340px", background: "#141420", borderRadius: "6px", marginBottom: "16px" }} className="skeleton" />
        <div style={{ height: "8px", width: "100%", background: "#141420", borderRadius: "4px", marginBottom: "32px" }} className="skeleton" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "28px" }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ height: "76px", background: "#141420", borderRadius: "10px" }} className="skeleton" />
          ))}
        </div>
        <div style={{ height: "320px", background: "#141420", borderRadius: "12px" }} className="skeleton" />
      </div>
    );
  }

  if (error || !data || !data.contract) {
    return (
      <div style={{ padding: "32px" }}>
        <Link href="/sprints" style={{ color: "#7c3aed", textDecoration: "none", fontSize: "13px" }}>← Back to Sprints</Link>
        <div style={{ marginTop: "24px", color: "#ef4444", fontSize: "14px" }}>Sprint not found.</div>
      </div>
    );
  }

  const { contract, metrics } = data;
  const allDefects: Defect[] = contract.iterations.flatMap((iter) => iter.defects || []);

  const isActive = contract.status === "dev" || contract.status === "qa" || contract.status === "running";

  const project = projects?.find((p) => p.id === contract.projectId);

  function getAccent(pid?: string) {
    if (pid === "w-construction") return "#f59e0b";
    if (pid === "mah-build") return "#a855f7";
    return "#7c3aed";
  }

  return (
    <div style={{ padding: "32px", maxWidth: "900px" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: "24px", fontSize: "13px", color: "#888898", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
        {project ? (
          <>
            <Link href="/projects" style={{ color: "#7c3aed", textDecoration: "none" }}>Projects</Link>
            <span>→</span>
            <Link
              href={`/projects/${project.id}`}
              style={{ color: getAccent(project.id), textDecoration: "none" }}
            >
              {project.name}
            </Link>
            <span>→</span>
            <span>Sprint #{contract.id}</span>
          </>
        ) : (
          <>
            <Link href="/sprints" style={{ color: "#7c3aed", textDecoration: "none" }}>Sprints</Link>
            <span>→</span>
            <span>Sprint #{contract.id}</span>
          </>
        )}
      </div>

      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "10px" }}>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "#e0e0e8" }}>
            #{contract.id} {contract.name}
          </h1>
          <VerdictBadge verdict={metrics?.verdict || contract.status} />
        </div>
        <div style={{ fontSize: "13px", color: "#888898", display: "flex", gap: "20px", flexWrap: "wrap" }}>
          <span>Started: {formatDateTime(contract.createdAt)}</span>
          {contract.completedAt && <span>Completed: {formatDateTime(contract.completedAt)}</span>}
        </div>
      </div>

      {/* Progress bar */}
      <SprintProgressBar
        status={contract.status}
        iterations={contract.iterations}
        isActive={isActive}
      />

      {/* Metrics summary */}
      {metrics && (
        <Section title="Metrics Summary">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
            {[
              { label: "Total Time", value: formatDuration(metrics.totals.durationMs) },
              { label: "Total Cost", value: `$${metrics.totals.estimatedCost.toFixed(2)}`, accent: "#7c3aed" },
              { label: "Iterations", value: metrics.totals.iterations },
              { label: "Defects Found", value: Object.values(metrics.quality.defectsFound).reduce((a, b) => a + b, 0) },
            ].map(({ label, value, accent }) => (
              <div
                key={label}
                style={{
                  background: "#141420",
                  border: "1px solid #2a2a3a",
                  borderRadius: "10px",
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: "11px", color: "#888898", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                <div style={{ fontSize: "24px", fontWeight: 700, color: accent || "#e0e0e8" }}>{value}</div>
              </div>
            ))}
          </div>
          {metrics.bottleneck && (
            <div style={{
              marginTop: "12px",
              padding: "10px 14px",
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.2)",
              borderRadius: "8px",
              fontSize: "13px",
              color: "#888898",
            }}>
              <span style={{ color: "#f59e0b", fontWeight: 600 }}>⚡ Bottleneck: </span>
              {metrics.bottleneck}
            </div>
          )}

          {/* Cost breakdown per phase */}
          {metrics.phases && metrics.phases.length > 0 && (
            <div style={{ marginTop: "16px" }}>
              <div style={{ fontSize: "12px", color: "#888898", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Cost breakdown by phase
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {metrics.phases.map((phase, i) => {
                  const pct = metrics.totals.estimatedCost > 0
                    ? (phase.costEstimate / metrics.totals.estimatedCost) * 100
                    : 0;
                  const phaseColor = phase.phase === "dev" ? "#3b82f6" : phase.phase === "qa" ? "#a855f7" : "#7c3aed";
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "60px", fontSize: "11px", color: phaseColor, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {phase.phase}{phase.round > 0 ? ` R${phase.round}` : ""}
                      </div>
                      <div style={{ flex: 1, height: "6px", background: "#1e1e2e", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{
                          height: "100%",
                          width: `${pct}%`,
                          background: phaseColor,
                          borderRadius: "3px",
                          transition: "width 0.4s ease",
                        }} />
                      </div>
                      <div style={{ width: "44px", fontSize: "11px", color: "#888898", textAlign: "right" }}>
                        ${phase.costEstimate.toFixed(2)}
                      </div>
                      <div style={{ width: "32px", fontSize: "10px", color: "#555565", textAlign: "right" }}>
                        {Math.round(pct)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Timeline */}
      <Section title="Sprint Timeline">
        <SprintTimeline contract={contract} metrics={metrics} />
      </Section>

      {/* Defects */}
      {allDefects.length > 0 && (
        <Section title={`Defects (${allDefects.length})`}>
          <DefectTable defects={allDefects} />
        </Section>
      )}

      {/* Sprint Contract */}
      <Section title="Sprint Contract">
        <div style={{
          background: "#141420",
          border: "1px solid #2a2a3a",
          borderRadius: "12px",
          overflow: "hidden",
        }}>
          {/* Task */}
          <div style={{ padding: "20px", borderBottom: "1px solid #2a2a3a" }}>
            <div style={{ fontSize: "11px", color: "#888898", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Task</div>
            <div style={{ fontSize: "14px", color: "#e0e0e8", lineHeight: 1.6 }}>{contract.task}</div>
          </div>

          {/* Dev Brief */}
          <div style={{ padding: "20px", borderBottom: "1px solid #2a2a3a" }}>
            <div style={{ fontSize: "11px", color: "#3b82f6", marginBottom: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Dev Brief</div>
            <div style={{ fontSize: "12px", color: "#888898", marginBottom: "8px" }}>
              Repo: <code style={{ color: "#e0e0e8", background: "#0d0d18", padding: "1px 5px", borderRadius: "4px" }}>{contract.devBrief.repo}</code>
            </div>
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "12px", color: "#888898", marginBottom: "6px" }}>Constraints:</div>
              <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {contract.devBrief.constraints.map((c, i) => (
                  <li key={i} style={{ fontSize: "13px", color: "#e0e0e8" }}>{c}</li>
                ))}
              </ul>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#888898", marginBottom: "6px" }}>Definition of Done:</div>
              <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {contract.devBrief.definitionOfDone.map((d, i) => (
                  <li key={i} style={{ fontSize: "13px", color: "#e0e0e8" }}>{d}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* QA Brief */}
          <div style={{ padding: "20px" }}>
            <div style={{ fontSize: "11px", color: "#a855f7", marginBottom: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>QA Brief</div>
            <div style={{ fontSize: "12px", color: "#888898", marginBottom: "8px" }}>
              Tier: <span style={{ color: "#e0e0e8" }}>{contract.qaBrief.tier}</span>
              {" · "}
              Test URL: <code style={{ color: "#e0e0e8", background: "#0d0d18", padding: "1px 5px", borderRadius: "4px" }}>{contract.qaBrief.testUrl}</code>
            </div>
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "12px", color: "#888898", marginBottom: "6px" }}>Pass Criteria:</div>
              <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {contract.qaBrief.passCriteria.map((c, i) => (
                  <li key={i} style={{ fontSize: "13px", color: "#e0e0e8" }}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
