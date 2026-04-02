export default function SprintsLoading() {
  const cols = "60px 1fr 140px 120px 80px 80px 100px";
  return (
    <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div className="skeleton" style={{ width: 160, height: 32, borderRadius: 6 }} />
        <div className="skeleton" style={{ width: 120, height: 36, borderRadius: 8 }} />
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[100, 80, 80, 80, 80].map((w, i) => (
          <div key={i} className="skeleton" style={{ width: w, height: 32, borderRadius: 6 }} />
        ))}
      </div>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "8px 16px", marginBottom: 8 }}>
        {[40, 80, 80, 80, 40, 40, 60].map((w, i) => (
          <div key={i} className="skeleton" style={{ width: w, height: 14, borderRadius: 4 }} />
        ))}
      </div>

      {/* Sprint rows */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: cols, gap: 12,
          padding: "14px 16px", marginBottom: 4,
          background: "#0f1116", borderRadius: 8, border: "1px solid #1c1d26"
        }}>
          <div className="skeleton" style={{ width: 36, height: 16, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: "75%", height: 16, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: 100, height: 16, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: 80, height: 16, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: 30, height: 16, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: 40, height: 16, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: 60, height: 22, borderRadius: 12 }} />
        </div>
      ))}
    </div>
  );
}
