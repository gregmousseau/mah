"use client";

import { useState } from "react";
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
      flexShrink: 0,
    }}>
      {s.label}
    </span>
  );
}

function DefectRow({ defect }: { defect: Defect }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: defect.fixed ? "rgba(20, 20, 32, 0.6)" : "#141420",
        border: "1px solid #2a2a3a",
        borderRadius: "8px",
        overflow: "hidden",
        opacity: defect.fixed ? 0.8 : 1,
        transition: "border-color 0.15s",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "12px 14px",
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          textAlign: "left",
          color: "inherit",
        }}
      >
        <SeverityBadge severity={defect.severity} />
        <div style={{ flex: 1, fontSize: "13px", color: "#e0e0e8", lineHeight: 1.5 }}>
          {defect.description}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
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
          <span style={{ fontSize: "10px", color: "#555565", marginLeft: "4px" }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {expanded && (
        <div style={{
          borderTop: "1px solid #2a2a3a",
          padding: "12px 14px",
          background: "rgba(0,0,0,0.2)",
        }}>
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", fontSize: "12px" }}>
            <div>
              <span style={{ color: "#555565" }}>ID: </span>
              <code style={{ color: "#a855f7", background: "#0d0d18", padding: "1px 5px", borderRadius: "4px" }}>
                {defect.id}
              </code>
            </div>
            <div>
              <span style={{ color: "#555565" }}>Severity: </span>
              <span style={{ color: SEVERITY_COLORS[defect.severity]?.color || "#888898", fontWeight: 600 }}>
                {defect.severity.toUpperCase()}
              </span>
            </div>
            <div>
              <span style={{ color: "#555565" }}>Status: </span>
              <span style={{ color: defect.fixed ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                {defect.fixed ? "Resolved" : "Open"}
              </span>
            </div>
          </div>
          {defect.fixed && (
            <div style={{ marginTop: "8px", fontSize: "12px", color: "#888898" }}>
              <span style={{ color: "#22c55e" }}>✓</span> Fixed in the following iteration.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DefectTable({ defects }: { defects: Defect[] }) {
  if (!defects || defects.length === 0) {
    return (
      <div style={{ color: "#888898", fontSize: "14px", padding: "16px 0" }}>No defects found.</div>
    );
  }

  // Group by severity for display order
  const order = ["p0", "p1", "p2", "p3"];
  const grouped: Record<string, Defect[]> = {};
  for (const d of defects) {
    if (!grouped[d.severity]) grouped[d.severity] = [];
    grouped[d.severity].push(d);
  }

  const sortedDefects = order.flatMap((sev) => grouped[sev] || []);
  const openCount = defects.filter((d) => !d.fixed).length;
  const fixedCount = defects.filter((d) => d.fixed).length;

  return (
    <div>
      {/* Summary */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "12px", flexWrap: "wrap" }}>
        {openCount > 0 && (
          <span style={{ fontSize: "12px", color: "#ef4444" }}>
            <strong>{openCount}</strong> open
          </span>
        )}
        {fixedCount > 0 && (
          <span style={{ fontSize: "12px", color: "#22c55e" }}>
            <strong>{fixedCount}</strong> fixed
          </span>
        )}
        <span style={{ fontSize: "12px", color: "#555565" }}>Click any row to expand</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {sortedDefects.map((defect) => (
          <DefectRow key={defect.id} defect={defect} />
        ))}
      </div>
    </div>
  );
}
