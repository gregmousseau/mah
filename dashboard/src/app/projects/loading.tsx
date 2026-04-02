export default function ProjectsLoading() {
  return (
    <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div className="skeleton" style={{ width: 140, height: 32, borderRadius: 6 }} />
        <div className="skeleton" style={{ width: 130, height: 36, borderRadius: 8 }} />
      </div>

      {/* Project card grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{
            background: "#0f1116", border: "1px solid #1c1d26",
            borderRadius: 12, overflow: "hidden"
          }}>
            {/* Accent bar */}
            <div className="skeleton" style={{ height: 3 }} />
            <div style={{ padding: 20 }}>
              {/* Title + badge */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div className="skeleton" style={{ width: 150, height: 20, borderRadius: 4 }} />
                <div className="skeleton" style={{ width: 50, height: 20, borderRadius: 10 }} />
              </div>
              {/* Repo */}
              <div className="skeleton" style={{ width: 180, height: 13, borderRadius: 4, marginBottom: 16 }} />
              {/* Stats grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {["Sprints", "Pass Rate", "Cost"].map((_, j) => (
                  <div key={j}>
                    <div className="skeleton" style={{ width: "70%", height: 20, borderRadius: 4, marginBottom: 4 }} />
                    <div className="skeleton" style={{ width: "60%", height: 12, borderRadius: 4 }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
