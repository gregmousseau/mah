import type { SprintContract, SprintMetrics } from "@/types/mah";

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

interface NodeProps {
  title: string;
  subtitle?: string;
  time?: string;
  duration?: string;
  cost?: string;
  verdict?: "pass" | "fail" | "warn" | null;
  defectCount?: number;
  phase: "plan" | "dev" | "qa" | "contract";
  isLast?: boolean;
}

function TimelineNode({ title, subtitle, time, duration, cost, verdict, defectCount, phase, isLast }: NodeProps) {
  const phaseColors: Record<string, string> = {
    contract: "#7c3aed",
    plan: "#7c3aed",
    dev: "#3b82f6",
    qa: "#a855f7",
  };

  const verdictColors = {
    pass: "#22c55e",
    fail: "#ef4444",
    warn: "#f59e0b",
  };

  const color = phaseColors[phase] || "#888898";
  const borderColor = verdict ? verdictColors[verdict] : color;

  return (
    <div style={{ display: "flex", gap: "16px" }}>
      {/* Left column: dot + line */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "24px", flexShrink: 0 }}>
        <div
          style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            background: borderColor,
            border: `2px solid ${borderColor}`,
            boxShadow: `0 0 8px ${borderColor}66`,
            flexShrink: 0,
            marginTop: "10px",
          }}
        />
        {!isLast && (
          <div
            style={{
              flex: 1,
              width: "2px",
              background: "#2a2a3a",
              minHeight: "24px",
              marginTop: "4px",
            }}
          />
        )}
      </div>

      {/* Right column: card */}
      <div
        style={{
          flex: 1,
          background: "#141420",
          border: `1px solid ${verdict ? borderColor + "44" : "#2a2a3a"}`,
          borderRadius: "10px",
          padding: "14px 16px",
          marginBottom: isLast ? 0 : "12px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: color,
                  background: `${color}20`,
                  border: `1px solid ${color}40`,
                  borderRadius: "5px",
                  padding: "1px 6px",
                  letterSpacing: "0.05em",
                }}
              >
                {phase.toUpperCase()}
              </span>
              <span style={{ fontWeight: 600, fontSize: "14px", color: "#e0e0e8" }}>{title}</span>
            </div>
            {subtitle && (
              <div style={{ fontSize: "12px", color: "#888898", marginTop: "6px", lineHeight: 1.5 }}>
                {subtitle}
              </div>
            )}
          </div>

          {verdict && (
            <div style={{ flexShrink: 0 }}>
              {verdict === "pass" && (
                <span style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", fontWeight: 700 }}>
                  ✓ PASS
                </span>
              )}
              {verdict === "fail" && (
                <span style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", fontWeight: 700 }}>
                  ✗ FAIL{defectCount ? ` (${defectCount} defects)` : ""}
                </span>
              )}
            </div>
          )}
        </div>

        {(time || duration || cost) && (
          <div style={{ display: "flex", gap: "16px", marginTop: "10px", flexWrap: "wrap" }}>
            {time && (
              <div style={{ fontSize: "11px", color: "#888898" }}>
                <span style={{ color: "#555565" }}>@</span> {time}
              </div>
            )}
            {duration && (
              <div style={{ fontSize: "11px", color: "#888898" }}>
                <span style={{ color: "#555565" }}>⏱</span> {duration}
              </div>
            )}
            {cost && (
              <div style={{ fontSize: "11px", color: "#888898" }}>
                <span style={{ color: "#555565" }}>$</span> {cost}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  contract: SprintContract;
  metrics?: SprintMetrics | null;
}

export default function SprintTimeline({ contract, metrics }: Props) {
  const nodes: NodeProps[] = [];

  // Contract created
  nodes.push({
    phase: "contract",
    title: "Sprint Contract",
    subtitle: contract.task,
    time: formatTime(contract.createdAt),
    verdict: null,
  });

  // Iterations
  for (const iter of contract.iterations) {
    const devDuration = formatDuration(iter.dev.durationMs);
    const qaDuration = formatDuration(iter.qa.durationMs);

    // Find QA verdict from defects
    const qaFailed = iter.defects && iter.defects.length > 0;
    const p0p1Count = iter.defects?.filter((d) => d.severity === "p0" || d.severity === "p1").length || 0;

    nodes.push({
      phase: "dev",
      title: `Dev Round ${iter.round}`,
      subtitle: iter.dev.output,
      time: formatTime(iter.dev.startTime),
      duration: devDuration,
      cost: `$${iter.dev.costEstimate.toFixed(2)}`,
      verdict: null,
    });

    // QA verdict
    const isLastIter = iter.round === contract.iterations.length;
    nodes.push({
      phase: "qa",
      title: `QA Round ${iter.round}`,
      subtitle: iter.qa.output,
      time: formatTime(iter.qa.startTime),
      duration: qaDuration,
      cost: `$${iter.qa.costEstimate.toFixed(2)}`,
      verdict: isLastIter
        ? (contract.status === "passed" ? "pass" : "fail")
        : qaFailed
        ? "fail"
        : "pass",
      defectCount: iter.defects?.length || 0,
    });
  }

  return (
    <div>
      {nodes.map((node, i) => (
        <TimelineNode key={i} {...node} isLast={i === nodes.length - 1} />
      ))}

      {/* Summary bar — only shown when metrics are available */}
      {metrics && (
        <div style={{
          marginTop: "16px",
          padding: "12px 16px",
          background: contract.status === "passed"
            ? "rgba(34, 197, 94, 0.08)"
            : "rgba(239, 68, 68, 0.08)",
          border: `1px solid ${contract.status === "passed" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
          borderRadius: "10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
        }}>
          <span style={{
            fontWeight: 700,
            color: contract.status === "passed" ? "#22c55e" : "#ef4444",
            fontSize: "14px",
          }}>
            {contract.status === "passed" ? "✓ Sprint Passed" : "✗ Sprint Failed"}
          </span>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", color: "#888898" }}>
              Total: <strong style={{ color: "#e0e0e8" }}>{formatDuration(metrics.totals.durationMs)}</strong>
            </span>
            <span style={{ fontSize: "12px", color: "#888898" }}>
              Cost: <strong style={{ color: "#e0e0e8" }}>${metrics.totals.estimatedCost.toFixed(2)}</strong>
            </span>
            <span style={{ fontSize: "12px", color: "#888898" }}>
              Iterations: <strong style={{ color: "#e0e0e8" }}>{metrics.totals.iterations}</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
