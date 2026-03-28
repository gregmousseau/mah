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
        color: "#f59e0b",
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

  return (
    <span style={{
      background: "rgba(136, 136, 152, 0.15)",
      color: "#888898",
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
