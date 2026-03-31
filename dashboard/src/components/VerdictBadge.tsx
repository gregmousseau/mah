export default function VerdictBadge({ verdict }: { verdict: string }) {
  const v = verdict?.toLowerCase();

  if (v === "pass" || v === "passed") {
    return (
      <span style={{
        background: "rgba(34, 197, 94, 0.15)",
        color: "#22c55e",
        border: "1px solid rgba(34, 197, 94, 0.3)",
        borderRadius: "6px",
        padding: "2px 8px",
        fontSize: "12px",
        fontWeight: 600,
        letterSpacing: "0.03em",
        whiteSpace: "nowrap",
      }}>
        ✓ PASS
      </span>
    );
  }

  if (v === "fail" || v === "failed") {
    return (
      <span style={{
        background: "rgba(239, 68, 68, 0.15)",
        color: "#ef4444",
        border: "1px solid rgba(239, 68, 68, 0.3)",
        borderRadius: "6px",
        padding: "2px 8px",
        fontSize: "12px",
        fontWeight: 600,
        letterSpacing: "0.03em",
        whiteSpace: "nowrap",
      }}>
        ✗ FAIL
      </span>
    );
  }

  if (v === "conditional") {
    return (
      <span style={{
        background: "rgba(245, 158, 11, 0.15)",
        color: "#eab308",
        border: "1px solid rgba(245, 158, 11, 0.3)",
        borderRadius: "6px",
        padding: "2px 8px",
        fontSize: "12px",
        fontWeight: 600,
        letterSpacing: "0.03em",
        whiteSpace: "nowrap",
      }}>
        ⚠ CONDITIONAL
      </span>
    );
  }

  if (v === "draft") {
    return (
      <span style={{
        background: "rgba(85, 85, 101, 0.15)",
        color: "#9ca3af",
        border: "1px solid rgba(85, 85, 101, 0.3)",
        borderRadius: "6px",
        padding: "2px 8px",
        fontSize: "12px",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}>
        ○ DRAFT
      </span>
    );
  }

  if (v === "scheduled") {
    return (
      <span style={{
        background: "rgba(59, 130, 246, 0.15)",
        color: "#60a5fa",
        border: "1px solid rgba(59, 130, 246, 0.3)",
        borderRadius: "6px",
        padding: "2px 8px",
        fontSize: "12px",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}>
        🕐 SCHEDULED
      </span>
    );
  }

  if (v === "approved") {
    return (
      <span style={{
        background: "rgba(20, 184, 166, 0.15)",
        color: "#fb923c",
        border: "1px solid rgba(20, 184, 166, 0.3)",
        borderRadius: "6px",
        padding: "2px 8px",
        fontSize: "12px",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}>
        ✦ APPROVED
      </span>
    );
  }

  return (
    <span style={{
      background: "rgba(136, 136, 152, 0.15)",
      color: "#9ca3af",
      border: "1px solid rgba(136, 136, 152, 0.3)",
      borderRadius: "6px",
      padding: "2px 8px",
      fontSize: "12px",
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {verdict?.toUpperCase() || "—"}
    </span>
  );
}
