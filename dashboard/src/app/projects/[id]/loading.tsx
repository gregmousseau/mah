export default function ProjectDetailLoading() {
  return (
    <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <div className="skeleton" style={{ width: 60, height: 14, borderRadius: 4 }} />
        <div className="skeleton" style={{ width: 8, height: 14, borderRadius: 4 }} />
        <div className="skeleton" style={{ width: 120, height: 14, borderRadius: 4 }} />
      </div>

      {/* Header card */}
      <div style={{ background: "#0f1116", border: "1px solid #1c1d26", borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="skeleton" style={{ width: 220, height: 28, borderRadius: 6, marginBottom: 10 }} />
            <div className="skeleton" style={{ width: 200, height: 14, borderRadius: 4 }} />
          </div>
          <div className="skeleton" style={{ width: 80, height: 28, borderRadius: 8 }} />
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ background: "#0f1116", border: "1px solid #1c1d26", borderRadius: 10, padding: 16 }}>
            <div className="skeleton" style={{ width: "60%", height: 26, borderRadius: 4, marginBottom: 6 }} />
            <div className="skeleton" style={{ width: "80%", height: 13, borderRadius: 4 }} />
          </div>
        ))}
      </div>

      {/* Sprint list header */}
      <div className="skeleton" style={{ width: 120, height: 20, borderRadius: 4, marginBottom: 12 }} />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: "60px 1fr 120px 80px 80px 100px",
          gap: 12, padding: "12px 16px", marginBottom: 4,
          background: "#0f1116", borderRadius: 8, border: "1px solid #1c1d26"
        }}>
          <div className="skeleton" style={{ width: 36, height: 16, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: "70%", height: 16, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: 90, height: 16, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: 30, height: 16, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: 45, height: 16, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: 60, height: 22, borderRadius: 12 }} />
        </div>
      ))}
    </div>
  );
}
