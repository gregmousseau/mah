const COLUMNS = ["Draft", "Queued", "Running", "Dev", "QA", "Pass", "Fail"];
const CARD_COUNTS = [3, 2, 2, 2, 2, 3, 2];

export default function BoardLoading() {
  return (
    <div style={{ padding: "24px 32px", height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div className="skeleton" style={{ width: 120, height: 28, borderRadius: 6 }} />
        <div className="skeleton" style={{ width: 80, height: 28, borderRadius: 6 }} />
      </div>

      {/* Columns */}
      <div style={{ display: "flex", gap: 12, flex: 1, overflowX: "auto" }}>
        {COLUMNS.map((col, ci) => (
          <div key={col} style={{
            minWidth: 220, flex: "1 1 220px", maxWidth: 300,
            background: "#0f1116", border: "1px solid #1c1d26",
            borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8
          }}>
            {/* Column header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div className="skeleton" style={{ width: 70, height: 18, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: 24, height: 18, borderRadius: 10 }} />
            </div>

            {/* Cards */}
            {Array.from({ length: CARD_COUNTS[ci] }).map((_, i) => (
              <div key={i} style={{
                background: "#14151b", border: "1px solid #1c1d26",
                borderRadius: 8, padding: 12
              }}>
                <div className="skeleton" style={{ width: "85%", height: 14, borderRadius: 4, marginBottom: 8 }} />
                <div className="skeleton" style={{ width: "60%", height: 12, borderRadius: 4, marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <div className="skeleton" style={{ width: 50, height: 20, borderRadius: 10 }} />
                  <div className="skeleton" style={{ width: 40, height: 20, borderRadius: 10 }} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
