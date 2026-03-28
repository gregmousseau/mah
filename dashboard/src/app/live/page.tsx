import Link from "next/link";
import type { MahEvent, SprintSummary } from "@/types/mah";

async function getEvents(): Promise<MahEvent[]> {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3333";
  const res = await fetch(`${base}/api/events?limit=30`, { cache: "no-store" });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function getSprints(): Promise<SprintSummary[]> {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3333";
  const res = await fetch(`${base}/api/sprints`, { cache: "no-store" });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function actorColor(actor: string) {
  switch (actor) {
    case "dev": return "#3b82f6";
    case "quinn": return "#a855f7";
    case "moe": return "#7c3aed";
    case "system": return "#888898";
    default: return "#888898";
  }
}

function typeIcon(type: string) {
  switch (type) {
    case "milestone": return "🏁";
    case "spawn": return "⚡";
    case "decision": return "⚖️";
    case "output": return "📤";
    default: return "•";
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default async function LivePage() {
  const [events, sprints] = await Promise.all([getEvents(), getSprints()]);

  // Check if there's an "active" sprint (running status)
  const activeSprint = sprints.find((s) => s.status === "running");
  const lastSprint = sprints.length > 0 ? sprints[sprints.length - 1] : null;

  // Sort events oldest-first for display
  const sortedEvents = [...events].reverse();

  return (
    <div style={{ padding: "32px", maxWidth: "900px" }}>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 700, color: "#e0e0e8" }}>Live</h1>
        <div style={{ fontSize: "13px", color: "#888898" }}>Real-time event stream</div>
      </div>

      {/* Status banner */}
      {activeSprint ? (
        <div style={{
          background: "rgba(124, 58, 237, 0.1)",
          border: "1px solid rgba(168, 85, 247, 0.3)",
          borderRadius: "12px",
          padding: "20px 24px",
          marginBottom: "28px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}>
          <div style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: "#a855f7",
            boxShadow: "0 0 10px #a855f7",
            animation: "pulse 2s infinite",
            flexShrink: 0,
          }} />
          <div>
            <div style={{ fontWeight: 600, color: "#e0e0e8" }}>Sprint #{activeSprint.id} is running</div>
            <div style={{ fontSize: "12px", color: "#888898", marginTop: "2px" }}>{activeSprint.name}</div>
          </div>
        </div>
      ) : (
        <div style={{
          background: "#141420",
          border: "1px solid #2a2a3a",
          borderRadius: "12px",
          padding: "20px 24px",
          marginBottom: "28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#555565",
              flexShrink: 0,
            }} />
            <div>
              <div style={{ fontWeight: 600, color: "#e0e0e8" }}>No active sprint</div>
              <div style={{ fontSize: "12px", color: "#888898", marginTop: "2px" }}>MAH is idle. Ready for next sprint.</div>
            </div>
          </div>
          {lastSprint && (
            <Link
              href={`/sprints/${lastSprint.id}`}
              style={{
                fontSize: "12px",
                color: "#7c3aed",
                textDecoration: "none",
                border: "1px solid rgba(124, 58, 237, 0.3)",
                borderRadius: "6px",
                padding: "6px 12px",
              }}
            >
              View last sprint →
            </Link>
          )}
        </div>
      )}

      {/* Event stream */}
      <div style={{ background: "#141420", border: "1px solid #2a2a3a", borderRadius: "12px", overflow: "hidden" }}>
        <div style={{
          padding: "14px 20px",
          borderBottom: "1px solid #2a2a3a",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#e0e0e8" }}>Event Stream</div>
          <div style={{ fontSize: "11px", color: "#888898" }}>Showing last {sortedEvents.length} events</div>
        </div>

        {sortedEvents.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", color: "#888898", fontSize: "14px" }}>
            No events found.
          </div>
        ) : (
          <div style={{ maxHeight: "600px", overflowY: "auto" }}>
            {sortedEvents.map((event, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: "14px",
                  padding: "12px 20px",
                  borderBottom: i < sortedEvents.length - 1 ? "1px solid #1e1e2e" : "none",
                  alignItems: "flex-start",
                }}
              >
                {/* Time + actor */}
                <div style={{ flexShrink: 0, textAlign: "right", minWidth: "90px" }}>
                  <div style={{ fontSize: "11px", color: "#555565", fontFamily: "monospace" }}>{formatTime(event.ts)}</div>
                  <div style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: actorColor(event.actor),
                    marginTop: "2px",
                  }}>
                    {event.actor}
                  </div>
                </div>

                {/* Icon + content */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "14px" }}>{typeIcon(event.type)}</span>
                    <span style={{ fontSize: "13px", color: "#e0e0e8", lineHeight: 1.4 }}>{event.summary}</span>
                  </div>
                  {event.detail && (
                    <div style={{ fontSize: "12px", color: "#888898", marginTop: "4px", marginLeft: "20px", lineHeight: 1.4 }}>
                      {event.detail}
                    </div>
                  )}
                </div>

                {/* Phase badge */}
                <div style={{ flexShrink: 0 }}>
                  <span style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    color: event.phase === "dev" ? "#3b82f6" : event.phase === "qa" ? "#a855f7" : "#888898",
                    background: event.phase === "dev" ? "rgba(59,130,246,0.15)" : event.phase === "qa" ? "rgba(168,85,247,0.15)" : "rgba(136,136,152,0.1)",
                    border: `1px solid ${event.phase === "dev" ? "rgba(59,130,246,0.3)" : event.phase === "qa" ? "rgba(168,85,247,0.3)" : "rgba(136,136,152,0.2)"}`,
                    borderRadius: "4px",
                    padding: "2px 6px",
                    letterSpacing: "0.05em",
                  }}>
                    {event.phase}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
