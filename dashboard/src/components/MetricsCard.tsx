interface MetricsCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}

export default function MetricsCard({ label, value, sub, accent }: MetricsCardProps) {
  return (
    <div
      style={{
        background: "#0f1116",
        border: "1px solid #1c1d26",
        borderRadius: "12px",
        padding: "20px 24px",
        transition: "border-color 0.15s ease, background 0.15s ease",
      }}
      className="metrics-card"
    >
      <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "8px", letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: "32px", fontWeight: 700, color: accent || "#e0e0e8", lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "6px" }}>{sub}</div>
      )}
    </div>
  );
}
