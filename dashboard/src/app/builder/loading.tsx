export default function BuilderLoading() {
  return (
    <div style={{ padding: "32px", maxWidth: "1100px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div className="skeleton" style={{ width: 200, height: 32, borderRadius: 6, marginBottom: 8 }} />
        <div className="skeleton" style={{ width: 320, height: 16, borderRadius: 4 }} />
      </div>

      {/* 2-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24 }}>
        {/* Left: form fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Sprint name */}
          <div>
            <div className="skeleton" style={{ width: 100, height: 14, borderRadius: 4, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: "100%", height: 40, borderRadius: 8 }} />
          </div>
          {/* Task description */}
          <div>
            <div className="skeleton" style={{ width: 140, height: 14, borderRadius: 4, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: "100%", height: 120, borderRadius: 8 }} />
          </div>
          {/* Agent selector */}
          <div>
            <div className="skeleton" style={{ width: 80, height: 14, borderRadius: 4, marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 8 }}>
              {[90, 90, 90, 90].map((w, i) => (
                <div key={i} className="skeleton" style={{ width: w, height: 36, borderRadius: 8 }} />
              ))}
            </div>
          </div>
          {/* Complexity */}
          <div>
            <div className="skeleton" style={{ width: 90, height: 14, borderRadius: 4, marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 8 }}>
              {[70, 70, 70].map((w, i) => (
                <div key={i} className="skeleton" style={{ width: w, height: 36, borderRadius: 8 }} />
              ))}
            </div>
          </div>
          {/* Submit button */}
          <div className="skeleton" style={{ width: "100%", height: 44, borderRadius: 8, marginTop: 8 }} />
        </div>

        {/* Right: preview panel */}
        <div style={{ background: "#0f1116", border: "1px solid #1c1d26", borderRadius: 12, padding: 20 }}>
          <div className="skeleton" style={{ width: 80, height: 16, borderRadius: 4, marginBottom: 16 }} />
          {[100, 80, 90, 70, 60].map((w, i) => (
            <div key={i} className="skeleton" style={{ width: `${w}%`, height: 13, borderRadius: 4, marginBottom: 10 }} />
          ))}
          <div style={{ marginTop: 20, borderTop: "1px solid #1c1d26", paddingTop: 16 }}>
            <div className="skeleton" style={{ width: 100, height: 14, borderRadius: 4, marginBottom: 12 }} />
            {[70, 85].map((w, i) => (
              <div key={i} className="skeleton" style={{ width: `${w}%`, height: 13, borderRadius: 4, marginBottom: 8 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
