function Section({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#0f1116", border: "1px solid #1c1d26", borderRadius: 12, padding: 20, marginBottom: 16 }}>
      {children}
    </div>
  );
}

export default function SprintDetailLoading() {
  return (
    <div style={{ padding: "32px", maxWidth: "1100px", margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        {[60, 8, 70, 8, 140].map((w, i) => (
          <div key={i} className="skeleton" style={{ width: w, height: 14, borderRadius: 4 }} />
        ))}
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {[80, 80, 90].map((w, i) => (
          <div key={i} className="skeleton" style={{ width: w, height: 34, borderRadius: 8 }} />
        ))}
      </div>

      {/* Header section */}
      <Section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="skeleton" style={{ width: 280, height: 26, borderRadius: 6, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: 180, height: 14, borderRadius: 4 }} />
          </div>
          <div className="skeleton" style={{ width: 80, height: 30, borderRadius: 12 }} />
        </div>
        {/* Progress bar */}
        <div className="skeleton" style={{ width: "100%", height: 8, borderRadius: 4, marginTop: 16 }} />
      </Section>

      {/* Metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ background: "#0f1116", border: "1px solid #1c1d26", borderRadius: 10, padding: 16 }}>
            <div className="skeleton" style={{ width: "50%", height: 22, borderRadius: 4, marginBottom: 6 }} />
            <div className="skeleton" style={{ width: "70%", height: 13, borderRadius: 4 }} />
          </div>
        ))}
      </div>

      {/* Timeline section */}
      <Section>
        <div className="skeleton" style={{ width: 100, height: 16, borderRadius: 4, marginBottom: 14 }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div className="skeleton" style={{ width: 12, height: 12, borderRadius: "50%", marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ width: "55%", height: 14, borderRadius: 4, marginBottom: 4 }} />
              <div className="skeleton" style={{ width: "35%", height: 12, borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </Section>

      {/* Grader results */}
      <Section>
        <div className="skeleton" style={{ width: 130, height: 16, borderRadius: 4, marginBottom: 14 }} />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <div className="skeleton" style={{ width: 60, height: 20, borderRadius: 10 }} />
            <div className="skeleton" style={{ width: "70%", height: 16, borderRadius: 4 }} />
          </div>
        ))}
      </Section>
    </div>
  );
}
