"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePolling } from "@/hooks/usePolling";

interface Heartbeat {
  alive: boolean;
  phase: string;
  round: number;
  elapsed: number;
  sprintId?: string;
  sprintName?: string;
  lastUpdate: string;
}

interface EventItem {
  ts: string;
  actor: string;
  type: string;
  phase: string;
  summary: string;
}

function useRelativeTime(iso: string | null): string {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!iso) return;
    const update = () => {
      const diff = Date.now() - new Date(iso).getTime();
      const secs = Math.floor(diff / 1000);
      if (secs < 10) setLabel("just now");
      else if (secs < 60) setLabel(`${secs}s ago`);
      else if (secs < 3600) setLabel(`${Math.floor(secs / 60)}m ago`);
      else setLabel(`${Math.floor(secs / 3600)}h ago`);
    };
    update();
    const t = setInterval(update, 5000);
    return () => clearInterval(t);
  }, [iso]);
  return label;
}

function HeartbeatDot({ heartbeat }: { heartbeat: Heartbeat | null }) {
  if (!heartbeat) return null;

  const age = heartbeat.lastUpdate
    ? (Date.now() - new Date(heartbeat.lastUpdate).getTime()) / 1000
    : Infinity;

  let color = "#22c55e";
  let label = "Responsive";
  let cls = "hb-green";

  if (age > 180) {
    color = "#ef4444";
    label = "Possibly stuck";
    cls = "hb-red";
  } else if (age > 60) {
    color = "#eab308";
    label = "Slow";
    cls = "hb-yellow";
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#9ca3af" }}>
      <div
        className={cls}
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      <span>{label}</span>
      {heartbeat.phase && (
        <span style={{ color: "#555565" }}>· {heartbeat.phase} r{heartbeat.round}</span>
      )}
    </div>
  );
}

export default function ActiveSprint({ compact = false }: { compact?: boolean }) {
  const { data: events } = usePolling<EventItem[]>("/api/events?limit=5", 5000);
  const { data: heartbeat } = usePolling<Heartbeat>("/api/heartbeat", 10000);

  const latestEvent = events && events.length > 0 ? events[0] : null;
  const lastTs = latestEvent?.ts ?? null;
  const relTime = useRelativeTime(lastTs);

  const isActive = (() => {
    if (heartbeat?.alive) return true; // heartbeat says alive — trust it
    if (!lastTs) return false;
    return Date.now() - new Date(lastTs).getTime() < 5 * 60 * 1000;
  })();

  const currentPhase = latestEvent?.phase || heartbeat?.phase || null;

  // Sprint label: prefer name from heartbeat, fall back to ID, then generic
  const sprintLabel = heartbeat?.sprintName
    ? `Sprint: ${heartbeat.sprintName}`
    : heartbeat?.sprintId
    ? `Sprint #${heartbeat.sprintId}`
    : "Sprint Active";

  const sprintHref = heartbeat?.sprintId ? `/sprints/${heartbeat.sprintId}` : null;

  if (compact) {
    return (
      <div style={{
        padding: "10px 12px",
        margin: "8px 10px",
        background: isActive ? "rgba(20,184,166,0.08)" : "rgba(0,0,0,0.2)",
        border: `1px solid ${isActive ? "rgba(20,184,166,0.25)" : "#1c1d26"}`,
        borderRadius: "8px",
        fontSize: "12px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <div
            className={isActive ? "dot-pulse" : ""}
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: isActive ? "#fb923c" : "#555565",
              flexShrink: 0,
            }}
          />
          <span style={{ color: isActive ? "#e0e0e8" : "#9ca3af", fontWeight: 500 }}>
            {isActive ? (sprintLabel) : "Ready"}
          </span>
        </div>
        {isActive && currentPhase && (
          <div style={{ marginTop: "4px", paddingLeft: "14px", color: "#9ca3af", fontSize: "11px" }}>
            {currentPhase} · {relTime}
          </div>
        )}
        {isActive && sprintHref && (
          <div style={{ marginTop: "4px", paddingLeft: "14px" }}>
            <Link href={sprintHref} style={{ fontSize: "11px", color: "#fb923c", textDecoration: "none" }}>
              View sprint →
            </Link>
          </div>
        )}
        {isActive && heartbeat && (
          <div style={{ marginTop: "4px", paddingLeft: "14px" }}>
            <HeartbeatDot heartbeat={heartbeat} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      background: isActive ? "rgba(20,184,166,0.08)" : "#0f1116",
      border: `1px solid ${isActive ? "rgba(20,184,166,0.25)" : "#1c1d26"}`,
      borderRadius: "12px",
      padding: "16px 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: "12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div
          className={isActive ? "dot-pulse" : ""}
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: isActive ? "#fb923c" : "#555565",
            flexShrink: 0,
          }}
        />
        <div>
          <div style={{ fontWeight: 600, color: "#e0e0e8", fontSize: "14px" }}>
            {isActive ? (
              sprintHref ? (
                <Link href={sprintHref} style={{ color: "#e0e0e8", textDecoration: "none" }}>
                  {sprintLabel}
                </Link>
              ) : sprintLabel
            ) : "Ready — No active sprint"}
          </div>
          {isActive && currentPhase && (
            <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "2px" }}>
              Phase: <span style={{
                color: currentPhase === "dev" ? "#3b82f6" : currentPhase === "qa" ? "#fb923c" : "#9ca3af"
              }}>{currentPhase}</span>
              {" · "}{relTime}
            </div>
          )}
          {!isActive && lastTs && (
            <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "2px" }}>
              Last activity {relTime}
            </div>
          )}
        </div>
      </div>

      {isActive && heartbeat && (
        <HeartbeatDot heartbeat={heartbeat} />
      )}
    </div>
  );
}
