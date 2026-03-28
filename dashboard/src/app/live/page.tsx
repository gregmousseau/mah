"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePolling } from "@/hooks/usePolling";
import type { MahEvent, SprintSummary } from "@/types/mah";

interface Heartbeat {
  alive: boolean;
  phase: string;
  round: number;
  elapsed: number;
  lastUpdate: string;
}

function actorColor(actor: string): string {
  switch (actor) {
    case "dev": return "#3b82f6";
    case "quinn": return "#a855f7";
    case "moe": return "#22c55e";
    case "system": return "#888898";
    default: return "#888898";
  }
}

function actorBorderColor(actor: string): string {
  switch (actor) {
    case "dev": return "rgba(59,130,246,0.5)";
    case "quinn": return "rgba(168,85,247,0.5)";
    case "moe": return "rgba(34,197,94,0.5)";
    case "system": return "rgba(136,136,152,0.3)";
    default: return "rgba(136,136,152,0.3)";
  }
}

function typeIcon(type: string): string {
  switch (type) {
    case "milestone": return "🏁";
    case "spawn": return "⚡";
    case "decision": return "⚖️";
    case "output": return "📤";
    default: return "•";
  }
}

function RelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = Date.now() - new Date(iso).getTime();
      const secs = Math.floor(diff / 1000);
      if (secs < 10) setLabel("just now");
      else if (secs < 60) setLabel(`${secs}s ago`);
      else if (secs < 3600) setLabel(`${Math.floor(secs / 60)} min ago`);
      else setLabel(`${Math.floor(secs / 3600)}h ago`);
    };
    update();
    const t = setInterval(update, 5000);
    return () => clearInterval(t);
  }, [iso]);

  return <span style={{ fontSize: "10px", color: "#555565" }}>{label}</span>;
}

function HeartbeatStatus({ heartbeat }: { heartbeat: Heartbeat | null }) {
  if (!heartbeat) return null;

  const age = heartbeat.lastUpdate
    ? (Date.now() - new Date(heartbeat.lastUpdate).getTime()) / 1000
    : Infinity;

  let color = "#22c55e";
  let label = "Agent responsive";
  let cls = "hb-green";

  if (age > 180) {
    color = "#ef4444";
    label = "Agent may be stuck";
    cls = "hb-red";
  } else if (age > 60) {
    color = "#f59e0b";
    label = "Agent slow";
    cls = "hb-yellow";
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#888898" }}>
      <div
        className={cls}
        style={{ width: "7px", height: "7px", borderRadius: "50%", background: color, flexShrink: 0 }}
      />
      <span>{label}</span>
      {heartbeat.phase && (
        <span style={{ color: "#555565" }}>
          · {heartbeat.phase} r{heartbeat.round}
          {heartbeat.elapsed ? ` · ${Math.round(heartbeat.elapsed / 1000)}s elapsed` : ""}
        </span>
      )}
    </div>
  );
}

export default function LivePage() {
  const { data: events } = usePolling<MahEvent[]>("/api/events?limit=50", 3000);
  const { data: sprints } = usePolling<SprintSummary[]>("/api/sprints", 5000);
  const { data: heartbeat } = usePolling<Heartbeat>("/api/heartbeat", 10000);

  const containerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const [newCount, setNewCount] = useState(0);

  // Check if sprint is active (most recent event < 5 min old)
  const latestEvent = events && events.length > 0 ? events[0] : null;
  const isActive = latestEvent
    ? Date.now() - new Date(latestEvent.ts).getTime() < 5 * 60 * 1000
    : false;

  const activeSprint = sprints?.find((s) => s.status === "running");
  const lastSprint = sprints && sprints.length > 0 ? sprints[sprints.length - 1] : null;

  // Track new events for fade-in animation
  useEffect(() => {
    const count = events?.length ?? 0;
    if (count > prevCountRef.current) {
      setNewCount(count - prevCountRef.current);
    }
    prevCountRef.current = count;
  }, [events]);

  // Sort newest first
  const sortedEvents = events ? [...events] : [];

  return (
    <div style={{ padding: "32px", maxWidth: "900px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 700, color: "#e0e0e8" }}>Live</h1>
        <div style={{ fontSize: "13px", color: "#888898" }}>Real-time event stream · auto-updates every 3s</div>
      </div>

      {/* Status banner */}
      {isActive || activeSprint ? (
        <div style={{
          background: "rgba(124, 58, 237, 0.1)",
          border: "1px solid rgba(168, 85, 247, 0.3)",
          borderRadius: "12px",
          padding: "16px 20px",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div className="dot-pulse" style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#a855f7",
              flexShrink: 0,
            }} />
            <div>
              <div style={{ fontWeight: 600, color: "#e0e0e8" }}>
                {activeSprint ? `Sprint #${activeSprint.id} in progress...` : "Sprint in progress..."}
              </div>
              {activeSprint && (
                <div style={{ fontSize: "12px", color: "#888898", marginTop: "2px" }}>{activeSprint.name}</div>
              )}
            </div>
          </div>
          <HeartbeatStatus heartbeat={heartbeat} />
        </div>
      ) : (
        <div style={{
          background: "#141420",
          border: "1px solid #2a2a3a",
          borderRadius: "12px",
          padding: "16px 20px",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#555565" }} />
            <div>
              <div style={{ fontWeight: 600, color: "#e0e0e8" }}>Waiting for next sprint</div>
              <div style={{ fontSize: "12px", color: "#888898", marginTop: "2px" }}>MAH is idle.</div>
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
          padding: "12px 20px",
          borderBottom: "1px solid #2a2a3a",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#0d0d18",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e8", fontFamily: "monospace" }}>Event Stream</div>
            {isActive && (
              <span style={{
                fontSize: "10px",
                color: "#22c55e",
                background: "rgba(34,197,94,0.1)",
                border: "1px solid rgba(34,197,94,0.3)",
                borderRadius: "4px",
                padding: "1px 6px",
              }}>LIVE</span>
            )}
          </div>
          <div style={{ fontSize: "11px", color: "#888898" }}>
            {sortedEvents.length} events · newest first
          </div>
        </div>

        {sortedEvents.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center" }}>
            <div style={{ fontSize: "28px", marginBottom: "10px" }}>📡</div>
            <div style={{ fontSize: "14px", color: "#888898", marginBottom: "6px" }}>Waiting for events...</div>
            <div style={{ fontSize: "12px", color: "#555565" }}>
              Start a sprint with{" "}
              <code style={{ background: "#0d0d18", padding: "1px 5px", borderRadius: "4px", color: "#a855f7" }}>mah run</code>
            </div>
          </div>
        ) : (
          <div ref={containerRef} style={{ maxHeight: "640px", overflowY: "auto" }}>
            {sortedEvents.map((event, i) => (
              <div
                key={`${event.ts}-${i}`}
                className={i < newCount ? "event-new" : ""}
                style={{
                  display: "flex",
                  gap: "0",
                  borderBottom: i < sortedEvents.length - 1 ? "1px solid #1a1a2a" : "none",
                  borderLeft: `3px solid ${actorBorderColor(event.actor)}`,
                  alignItems: "flex-start",
                  transition: "background 0.15s",
                }}
              >
                {/* Actor color strip */}
                <div style={{ flex: 1, display: "flex", gap: "14px", padding: "10px 16px", alignItems: "flex-start" }}>
                  {/* Time + actor */}
                  <div style={{ flexShrink: 0, textAlign: "right", minWidth: "80px" }}>
                    <RelativeTime iso={event.ts} />
                    <div style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: actorColor(event.actor),
                      marginTop: "2px",
                      fontFamily: "monospace",
                    }}>
                      {event.actor}
                    </div>
                  </div>

                  {/* Icon + content */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "13px" }}>{typeIcon(event.type)}</span>
                      <span style={{ fontSize: "13px", color: "#e0e0e8", lineHeight: 1.4 }}>{event.summary}</span>
                    </div>
                    {event.detail && (
                      <div style={{ fontSize: "12px", color: "#888898", marginTop: "3px", marginLeft: "20px", lineHeight: 1.4 }}>
                        {event.detail}
                      </div>
                    )}
                  </div>

                  {/* Phase badge */}
                  <div style={{ flexShrink: 0, paddingTop: "1px" }}>
                    <span style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      color: event.phase === "dev" ? "#3b82f6" : event.phase === "qa" ? "#a855f7" : "#555565",
                      background: event.phase === "dev" ? "rgba(59,130,246,0.1)" : event.phase === "qa" ? "rgba(168,85,247,0.1)" : "rgba(136,136,152,0.06)",
                      border: `1px solid ${event.phase === "dev" ? "rgba(59,130,246,0.25)" : event.phase === "qa" ? "rgba(168,85,247,0.25)" : "rgba(136,136,152,0.15)"}`,
                      borderRadius: "4px",
                      padding: "1px 5px",
                      letterSpacing: "0.05em",
                      fontFamily: "monospace",
                    }}>
                      {event.phase}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actor legend */}
      <div style={{ marginTop: "12px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
        {[
          { actor: "dev", label: "Dev agent" },
          { actor: "quinn", label: "Quinn (QA)" },
          { actor: "moe", label: "Moe (orchestrator)" },
          { actor: "system", label: "System" },
        ].map(({ actor, label }) => (
          <div key={actor} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#888898" }}>
            <div style={{ width: "3px", height: "14px", borderRadius: "2px", background: actorBorderColor(actor) }} />
            <span style={{ color: actorColor(actor) }}>{actor}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
