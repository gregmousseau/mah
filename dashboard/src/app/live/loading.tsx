export default function LiveLoading() {
  return (
    <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Status banner */}
      <div style={{
        background: "#0f1116", border: "1px solid #1c1d26",
        borderRadius: 12, padding: 20, marginBottom: 24,
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div className="skeleton" style={{ width: 12, height: 12, borderRadius: "50%" }} />
          <div>
            <div className="skeleton" style={{ width: 180, height: 20, borderRadius: 4, marginBottom: 6 }} />
            <div className="skeleton" style={{ width: 120, height: 14, borderRadius: 4 }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          {[60, 60, 80].map((w, i) => (
            <div key={i}>
              <div className="skeleton" style={{ width: w, height: 22, borderRadius: 4, marginBottom: 4 }} />
              <div className="skeleton" style={{ width: 50, height: 13, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20 }}>
        {/* Event log */}
        <div style={{ background: "#0f1116", border: "1px solid #1c1d26", borderRadius: 12, padding: 16 }}>
          <div className="skeleton" style={{ width: 100, height: 16, borderRadius: 4, marginBottom: 16 }} />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{
              borderLeft: "3px solid #1c1d26", paddingLeft: 14,
              marginBottom: 14, paddingBottom: 14,
              borderBottom: i < 6 ? "1px solid #1c1d26" : "none"
            }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                <div className="skeleton" style={{ width: 50, height: 12, borderRadius: 4 }} />
                <div className="skeleton" style={{ width: 60, height: 12, borderRadius: 10 }} />
              </div>
              <div className="skeleton" style={{ width: `${65 + (i % 3) * 10}%`, height: 14, borderRadius: 4 }} />
            </div>
          ))}
        </div>

        {/* Sidebar info panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#0f1116", border: "1px solid #1c1d26", borderRadius: 12, padding: 16 }}>
            <div className="skeleton" style={{ width: 80, height: 14, borderRadius: 4, marginBottom: 14 }} />
            {[["Phase", 70], ["Iteration", 50], ["Agent", 80], ["Cost", 55]].map(([, w], i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <div className="skeleton" style={{ width: 60, height: 13, borderRadius: 4 }} />
                <div className="skeleton" style={{ width: w as number, height: 13, borderRadius: 4 }} />
              </div>
            ))}
          </div>
          <div style={{ background: "#0f1116", border: "1px solid #1c1d26", borderRadius: 12, padding: 16 }}>
            <div className="skeleton" style={{ width: 60, height: 14, borderRadius: 4, marginBottom: 14 }} />
            {[24, 20, 20, 20].map((h, i) => (
              <div key={i} className="skeleton" style={{ width: "100%", height: h, borderRadius: 4, marginBottom: 8 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
