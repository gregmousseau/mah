"use client";

interface Props {
  status: string; // 'planned' | 'dev' | 'qa' | 'passed' | 'failed' | 'escalated' | 'running'
  iterations?: Array<{ round: number; defects?: Array<{ severity: string }> }>;
  isActive?: boolean;
}

type PhaseLabel = "Contract" | "Dev" | "QA" | "Complete";

const PHASE_ORDER: PhaseLabel[] = ["Contract", "Dev", "QA", "Complete"];

function getActivePhase(status: string): PhaseLabel | null {
  switch (status) {
    case "planned": return "Contract";
    case "dev": return "Dev";
    case "qa": return "QA";
    case "passed": return "Complete";
    case "escalated": return "Complete";
    case "failed": return "QA";
    default: return null;
  }
}

function isCompleted(phase: PhaseLabel, status: string): boolean {
  const order = PHASE_ORDER.indexOf(phase);
  const active = getActivePhase(status);
  if (!active) return false;
  const activeOrder = PHASE_ORDER.indexOf(active);
  return order < activeOrder;
}

export default function SprintProgressBar({ status, iterations = [], isActive = false }: Props) {
  const activePhase = getActivePhase(status);

  return (
    <div style={{
      background: "#141420",
      border: "1px solid #2a2a3a",
      borderRadius: "12px",
      padding: "18px 20px",
      marginBottom: "24px",
    }}>
      <div style={{ fontSize: "12px", color: "#888898", marginBottom: "14px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Sprint Progress
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
        {PHASE_ORDER.map((phase, i) => {
          const done = isCompleted(phase, status);
          const active = phase === activePhase;
          const isFinalFail = phase === "QA" && (status === "failed" || status === "escalated");
          const hasLoopback = iterations.length > 1 && (phase === "QA" || phase === "Dev");

          let dotColor = "#2a2a3a";
          let labelColor = "#555565";

          if (done) {
            dotColor = "#22c55e";
            labelColor = "#22c55e";
          } else if (active && !isFinalFail) {
            dotColor = phase === "Dev" ? "#3b82f6" : phase === "QA" ? "#a855f7" : "#7c3aed";
            labelColor = dotColor;
          } else if (isFinalFail) {
            dotColor = "#ef4444";
            labelColor = "#ef4444";
          }

          const isLast = i === PHASE_ORDER.length - 1;

          return (
            <div key={phase} style={{ display: "flex", alignItems: "center", flex: isLast ? 0 : 1 }}>
              {/* Phase dot + label */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    background: done ? "rgba(34,197,94,0.15)" : active ? `${dotColor}22` : "#0d0d18",
                    border: `2px solid ${dotColor}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "13px",
                    position: "relative",
                  }}
                  className={active && isActive ? "phase-pulse" : ""}
                >
                  {done && "✓"}
                  {isFinalFail && !done && "✗"}
                  {!done && !isFinalFail && active && (
                    <div style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: dotColor,
                    }} />
                  )}
                </div>
                <div style={{ fontSize: "11px", fontWeight: active ? 600 : 400, color: labelColor, whiteSpace: "nowrap" }}>
                  {phase}
                </div>
                {hasLoopback && active && iterations.length > 1 && (
                  <div style={{ fontSize: "10px", color: "#f59e0b" }}>
                    ×{iterations.length}
                  </div>
                )}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div style={{
                  flex: 1,
                  height: "2px",
                  background: done ? "#22c55e44" : "#2a2a3a",
                  margin: "0 4px",
                  marginBottom: "20px",
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Current status text */}
      <div style={{ marginTop: "10px", fontSize: "12px", color: "#888898" }}>
        {isActive && activePhase && (
          <span style={{ color: "#a855f7" }}>
            ● Running — {activePhase} phase
            {iterations.length > 1 ? ` (round ${iterations.length})` : ""}
          </span>
        )}
        {!isActive && status === "passed" && (
          <span style={{ color: "#22c55e" }}>✓ Completed in {iterations.length} iteration{iterations.length !== 1 ? "s" : ""}</span>
        )}
        {!isActive && (status === "failed" || status === "escalated") && (
          <span style={{ color: "#ef4444" }}>✗ {status === "escalated" ? "Escalated" : "Failed"} after {iterations.length} iteration{iterations.length !== 1 ? "s" : ""}</span>
        )}
      </div>
    </div>
  );
}
