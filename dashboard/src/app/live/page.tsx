"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePolling } from "@/hooks/usePolling";
import type { MahEvent, SprintSummary } from "@/types/mah";

interface Heartbeat {
  alive: boolean;
  phase: string;
  round: number;
  elapsed: number;
  sprintId?: string;
  sprintName?: string;
  lastUpdate: string;
}

interface QueueEntry {
  id: string;
  name: string;
  status: string;
  queuedAt?: string;
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

function ElapsedTime({ startMs }: { startMs: number }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const update = () => {
      const diff = Date.now() - startMs;
      const secs = Math.floor(diff / 1000);
      if (secs < 60) setLabel(`${secs}s`);
      else setLabel(`${Math.floor(secs / 60)}m ${secs % 60}s`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [startMs]);
  return <span>{label}</span>;
}

function HeartbeatStatus({ heartbeat }: { heartbeat: Heartbeat | null }) {
  if (!heartbeat) return null;
  const age = heartbeat.lastUpdate
    ? (Date.now() - new Date(heartbeat.lastUpdate).getTime()) / 1000
    : Infinity;

  let color = "#22c55e";
  let label = "Agent responsive";
  let cls = "hb-green";

  if (age > 180) { color = "#ef4444"; label = "Agent may be stuck"; cls = "hb-red"; }
  else if (age > 60) { color = "#f59e0b"; label = "Agent slow"; cls = "hb-yellow"; }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#888898" }}>
      <div className={cls} style={{ width: "7px", height: "7px", borderRadius: "50%", background: color, flexShrink: 0 }} />
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
  const router = useRouter();
  const { data: events } = usePolling<MahEvent[]>("/api/events?limit=50", 3000);
  const { data: sprints } = usePolling<SprintSummary[]>("/api/sprints", 5000);
  const { data: heartbeat } = usePolling<Heartbeat>("/api/heartbeat", 5000);
  const { data: queue } = usePolling<QueueEntry[]>("/api/sprints/queue", 5000);
  // Watchdog: auto-recovers stuck sprints every 60s (GET is side-effect-free when healthy)
  usePolling("/api/queue/watchdog", 60000);

  const containerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const [newCount, setNewCount] = useState(0);
  const [cancelling, setCancelling] = useState(false);

  const activeSprint = sprints?.find((s) => s.status === "running");
  const queuedSprints = queue || [];
  const nextInQueue = queuedSprints.find((q) => q.status === "queued");

  // Check if sprint is active (most recent event < 5 min old OR heartbeat alive)
  const latestEvent = events && events.length > 0 ? events[0] : null;
  const isEventActive = latestEvent
    ? Date.now() - new Date(latestEvent.ts).getTime() < 5 * 60 * 1000
    : false;
  const isActive = !!(activeSprint || isEventActive || heartbeat?.alive);

  // Compute cost from heartbeat or fallback
  const runningCost = activeSprint?.totalCost ?? 0;

  // Grader status (from heartbeat phase)
  const graders = [
    { name: "Quinn (UX)", phase: "qa", status: heartbeat?.phase === "qa" ? "Running" : activeSprint ? "Waiting" : "—" },
    { name: "Code Review", phase: "qa", status: heartbeat?.phase === "qa" && heartbeat.round > 1 ? "Running" : "Waiting" },
  ];

  // Track new events for fade-in animation
  useEffect(() => {
    const count = events?.length ?? 0;
    if (count > prevCountRef.current) {
      setNewCount(count - prevCountRef.current);
    }
    prevCountRef.current = count;
  }, [events]);

  const handleCancel = async () => {
    if (!activeSprint) return;
    if (!confirm("Cancel this sprint? Running work will be stopped.")) return;
    setCancelling(true);
    try {
      await fetch("/api/sprints/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId: activeSprint.id }),
      });
    } finally {
      setCancelling(false);
    }
  };

  const handleStartNext = async () => {
    if (!nextInQueue) return;
    await fetch("/api/sprints/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractId: nextInQueue.id }),
    });
  };

  const recentCompleted = sprints
    ? [...sprints]
        .filter((s) => s.status === "passed" || s.status === "failed" || s.status === "cancelled")
        .reverse()
        .slice(0, 3)
    : [];

  const sortedEvents = events ? [...events] : [];

  return (
    <div style={{ padding: "32px", maxWidth: "900px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 700, color: "#e0e0e8" }}>Live</h1>
        <div style={{ fontSize: "13px", color: "#888898" }}>Mission control · auto-updates every 3–5s</div>
      </div>

      {/* ─── RUNNING STATE ─── */}
      {isActive && activeSprint ? (
        <>
          {/* Sprint name banner */}
          <div style={{
            background: "rgba(124,58,237,0.1)",
            border: "1px solid rgba(168,85,247,0.4)",
            borderRadius: "12px",
            padding: "20px 24px",
            marginBottom: "16px",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div className="dot-pulse" style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#a855f7", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "18px", fontWeight: 700, color: "#e0e0e8", marginBottom: "4px" }}>
                    {activeSprint.name}
                  </div>
                  <div style={{ fontSize: "12px", color: "#888898", display: "flex", gap: "14px", flexWrap: "wrap" }}>
                    <span style={{ color: "#a855f7", fontWeight: 600, textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.06em" }}>
                      RUNNING
                    </span>
                    {heartbeat?.phase && (
                      <span>Phase: <span style={{ color: heartbeat.phase === "dev" ? "#3b82f6" : "#a855f7" }}>{heartbeat.phase}</span> · Round {heartbeat.round}</span>
                    )}
                    {heartbeat?.lastUpdate && (
                      <span>Running for: <ElapsedTime startMs={activeSprint.createdAt ? new Date(activeSprint.createdAt).getTime() : Date.now()} /></span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                {runningCost > 0 && (
                  <div style={{ fontSize: "13px", color: "#7c3aed", fontWeight: 600, background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: "6px", padding: "4px 10px" }}>
                    💰 ${runningCost.toFixed(3)}
                  </div>
                )}
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  style={{
                    padding: "8px 16px",
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.4)",
                    borderRadius: "8px",
                    color: "#ef4444",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: cancelling ? "not-allowed" : "pointer",
                    opacity: cancelling ? 0.6 : 1,
                  }}
                >
                  {cancelling ? "Cancelling..." : "⛔ Cancel Sprint"}
                </button>
              </div>
            </div>
          </div>

          {/* Grader progress */}
          <div style={{
            background: "#141420",
            border: "1px solid #2a2a3a",
            borderRadius: "10px",
            padding: "14px 20px",
            marginBottom: "16px",
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
          }}>
            <span style={{ fontSize: "11px", color: "#555565", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", alignSelf: "center" }}>Graders</span>
            {graders.map((g) => (
              <div key={g.name} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                <div style={{
                  width: "6px", height: "6px", borderRadius: "50%",
                  background: g.status === "Running" ? "#a855f7" : "#333345",
                }} className={g.status === "Running" ? "dot-pulse" : ""} />
                <span style={{ color: "#888898" }}>{g.name}:</span>
                <span style={{ color: g.status === "Running" ? "#a855f7" : "#555565" }}>{g.status}</span>
              </div>
            ))}
            <div style={{ marginLeft: "auto" }}>
              <HeartbeatStatus heartbeat={heartbeat} />
            </div>
          </div>
        </>
      ) : isActive && heartbeat?.alive ? (
        /* ─── HEARTBEAT-ONLY RUNNING STATE (activeSprint not loaded yet) ─── */
        <div style={{
          background: "rgba(124,58,237,0.1)",
          border: "1px solid rgba(168,85,247,0.4)",
          borderRadius: "12px",
          padding: "20px 24px",
          marginBottom: "16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div className="dot-pulse" style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#a855f7", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#e0e0e8", marginBottom: "4px" }}>
                {heartbeat.sprintName
                  ? heartbeat.sprintName
                  : heartbeat.sprintId
                  ? `Sprint #${heartbeat.sprintId}`
                  : "Sprint Running"}
              </div>
              <div style={{ fontSize: "12px", color: "#888898", display: "flex", gap: "14px", flexWrap: "wrap" }}>
                <span style={{ color: "#a855f7", fontWeight: 600, textTransform: "uppercase", fontSize: "11px" }}>RUNNING</span>
                {heartbeat.phase && (
                  <span>Phase: <span style={{ color: heartbeat.phase === "dev" ? "#3b82f6" : "#a855f7" }}>{heartbeat.phase}</span> · Round {heartbeat.round}</span>
                )}
              </div>
            </div>
            {heartbeat.sprintId && (
              <Link
                href={`/sprints/${heartbeat.sprintId}`}
                style={{
                  padding: "7px 14px",
                  background: "rgba(168,85,247,0.1)",
                  border: "1px solid rgba(168,85,247,0.3)",
                  borderRadius: "7px",
                  color: "#a855f7",
                  textDecoration: "none",
                  fontSize: "13px",
                  fontWeight: 500,
                }}
              >
                View Sprint →
              </Link>
            )}
          </div>
          <div style={{ marginTop: "12px" }}>
            <HeartbeatStatus heartbeat={heartbeat} />
          </div>
        </div>
      ) : queuedSprints.length > 0 ? (
        /* ─── QUEUE STATE ─── */
        <div style={{
          background: "#141420",
          border: "1px solid #2a2a3a",
          borderRadius: "12px",
          padding: "20px 24px",
          marginBottom: "16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "12px", color: "#555565", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                Next Up
              </div>
              <div style={{ fontSize: "16px", fontWeight: 600, color: "#e0e0e8" }}>
                {nextInQueue?.name || "Queued sprint"}
              </div>
            </div>
            <button
              onClick={handleStartNext}
              style={{
                padding: "10px 20px",
                background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                border: "none",
                borderRadius: "8px",
                color: "white",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              🚀 Start Now
            </button>
          </div>
          {queuedSprints.length > 1 && (
            <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: "1px solid #2a2a3a" }}>
              <div style={{ fontSize: "11px", color: "#555565", marginBottom: "8px" }}>Queue ({queuedSprints.length} items)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {queuedSprints.map((q, i) => (
                  <div key={q.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#888898" }}>
                    <span style={{ fontSize: "11px", color: "#555565" }}>#{i + 1}</span>
                    <span style={{ color: "#e0e0e8" }}>{q.name}</span>
                    <span style={{ fontSize: "10px", color: "#555565" }}>{q.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ─── IDLE STATE ─── */
        <div style={{
          background: "#141420",
          border: "1px solid #2a2a3a",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "16px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>✨</div>
          <div style={{ fontSize: "16px", fontWeight: 600, color: "#e0e0e8", marginBottom: "6px" }}>Ready for sprints</div>
          <div style={{ fontSize: "13px", color: "#888898", marginBottom: "20px" }}>MAH is idle. No active or queued sprints.</div>
          <Link
            href="/builder"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              background: "linear-gradient(135deg, #7c3aed, #a855f7)",
              borderRadius: "8px",
              textDecoration: "none",
              color: "white",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            🚀 Create a Sprint
          </Link>
          {recentCompleted.length > 0 && (
            <div style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid #2a2a3a", textAlign: "left" }}>
              <div style={{ fontSize: "12px", color: "#555565", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Recent Completions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {recentCompleted.map((s) => (
                  <Link
                    key={s.id}
                    href={`/sprints/${s.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "#0d0d18",
                      border: "1px solid #2a2a3a",
                      borderRadius: "8px",
                      textDecoration: "none",
                      gap: "8px",
                    }}
                  >
                    <span style={{ fontSize: "13px", color: "#e0e0e8" }}>{s.name}</span>
                    <span style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: s.status === "passed" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                      color: s.status === "passed" ? "#22c55e" : "#ef4444",
                    }}>
                      {s.status.toUpperCase()}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
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
              Start a sprint from the{" "}
              <Link href="/builder" style={{ color: "#a855f7", textDecoration: "none" }}>Builder</Link>
              {" "}or run{" "}
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
                <div style={{ flex: 1, display: "flex", gap: "14px", padding: "10px 16px", alignItems: "flex-start" }}>
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
