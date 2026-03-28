import type { Defect } from "@/types/mah";

const SEVERITY_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  p0: { bg: "rgba(239, 68, 68, 0.2)", color: "#ef4444", label: "P0" },
  p1: { bg: "rgba(249, 115, 22, 0.2)", color: "#f97316", label: "P1" },
  p2: { bg: "rgba(245, 158, 11, 0.2)", color: "#f59e0b", label: "P2" },
  p3: { bg: "rgba(136, 136, 152, 0.2)", color: "#888898", label: "P3" },
};

function SeverityBadge({ severity }: { severity: string }) {
  const s = SEVERITY_COLORS[severity] || SEVERITY_COLORS.p3;
  return (
    <span style={{
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.color}44`,
      borderRadius: "5px",
      padding: "2px 7px",
      fontSize: "11px",
      fontWeight: 700,
      fontFamily: "monospace",
    }}>
      {s.label}
    </span>
  );
}

export default function DefectTable({ defects }: { defects: Defect[] }) {
  if (!defects || defects.length === 0) {
    return (
      <div style={{ color: "#888898", fontSize: "14px", padding: "16px 0" }}>No defects found.</div>
    );
  }

  // Group by severity
  const grouped: Record<string, Defect[]> = {};
  for (const d of defects) {
    if (!grouped[d.severity]) grouped[d.severity] = [];
    grouped[d.severity].push(d);
  }

  const order = ["p0", "p1", "p2", "p3"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {order.flatMap((sev) =>
        (grouped[sev] || []).map((defect) => (
          <div
            key={defect.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
              padding: "12px 14px",
              background: defect.fixed ? "rgba(20, 20, 32, 0.6)" : "#141420",
              border: "1px solid #2a2a3a",
              borderRadius: "8px",
              opacity: defect.fixed ? 0.75 : 1,
            }}
          >
            <SeverityBadge severity={defect.severity} />
            <div style={{ flex: 1, fontSize: "13px", color: "#e0e0e8", lineHeight: 1.5 }}>
              {defect.description}
            </div>
            <div>
              {defect.fixed ? (
                <span style={{
                  background: "rgba(34, 197, 94, 0.12)",
                  color: "#22c55e",
                  border: "1px solid rgba(34, 197, 94, 0.25)",
                  borderRadius: "5px",
                  padding: "2px 8px",
                  fontSize: "11px",
                  fontWeight: 600,
                }}>
                  FIXED
                </span>
              ) : (
                <span style={{
                  background: "rgba(239, 68, 68, 0.12)",
                  color: "#ef4444",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  borderRadius: "5px",
                  padding: "2px 8px",
                  fontSize: "11px",
                  fontWeight: 600,
                }}>
                  OPEN
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
