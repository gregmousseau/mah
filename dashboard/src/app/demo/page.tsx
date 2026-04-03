"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, SkipForward, RotateCcw, ChevronRight, Zap, Clock, DollarSign, Bug, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { getAgentColor, getAgentIcon, getAgentName } from "@/lib/agents";

// ─── Types ───

interface SprintSummary {
  id: string;
  name: string;
  status: string;
  iterations: number;
  cost: number;
  createdAt: string;
  sprintType?: string;
  agentName?: string;
}

interface SprintRound {
  round: number;
  phase: string;
  actor: string;
  model: string;
  durationMs: number;
  outputPreview: string;
  defectCount?: number;
  verdict?: string;
}

interface DemoSprint {
  id: string;
  name: string;
  task: string;
  status: string;
  sprintType?: string;
  agentConfig?: {
    generator: { agentId: string; agentName: string };
    evaluator: { agentId: string; agentName: string };
  };
  iterations: number;
  rounds: SprintRound[];
  metrics?: {
    totalDurationMs: number;
    estimatedCost: number;
    defectsFound: number;
    defectsFixed: number;
  };
  createdAt: string;
  completedAt?: string;
}

// ─── Constants ───

const TYPING_SPEED = 8; // chars per frame (16ms)
const PHASE_PAUSE = 800; // ms between phases

// ─── Sprint List ───

function SprintListItem({
  sprint,
  active,
  onClick,
}: {
  sprint: SprintSummary;
  active: boolean;
  onClick: () => void;
}) {
  const statusColor = sprint.status === "passed" ? "#22c55e" : sprint.status === "failed" ? "#ef4444" : "#eab308";
  const agentColor = sprint.agentName === "Frankie" ? "#f97316" : sprint.agentName === "Devin" ? "#3b82f6" : sprint.agentName === "Reese" ? "#10b981" : sprint.agentName === "Connie" ? "#ec4899" : "#9ca3af";

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 14px",
        background: active ? "rgba(251,146,60,0.12)" : "transparent",
        borderTop: "none",
        borderRight: "none",
        borderBottom: "none",
        borderLeft: active ? "3px solid #fb923c" : "3px solid transparent",
        borderRadius: "0 8px 8px 0",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        transition: "all 0.15s",
      }}
    >
      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "12px",
          fontWeight: active ? 600 : 400,
          color: active ? "#e0e0e8" : "#9ca3af",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {sprint.name}
        </div>
        <div style={{ fontSize: "10px", color: "#555565", display: "flex", gap: "6px", marginTop: "2px" }}>
          {sprint.agentName && <span style={{ color: agentColor }}>{sprint.agentName}</span>}
          <span>${sprint.cost.toFixed(2)}</span>
          <span>R{sprint.iterations}</span>
        </div>
      </div>
    </button>
  );
}

// ─── Phase Replay Block ───

function PhaseBlock({
  round,
  isActive,
  displayedChars,
}: {
  round: SprintRound;
  isActive: boolean;
  displayedChars: number;
}) {
  const actorId = round.actor === "quinn" ? "qa" : round.actor === "dev" ? "dev" : round.actor === "code-reviewer" ? "dev" : "research";
  const color = getAgentColor(actorId);
  const icon = getAgentIcon(actorId);
  const name = round.actor === "code-reviewer" ? "Code Review" : (getAgentName(actorId) ?? round.actor);
  const isQA = round.phase === "qa";
  const outputRef = useRef<HTMLPreElement>(null);

  const visibleText = round.outputPreview.slice(0, displayedChars);

  // Auto-scroll to bottom as text types
  useEffect(() => {
    if (outputRef.current && isActive) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [displayedChars, isActive]);

  return (
    <div style={{
      marginBottom: "16px",
      borderTop: "none",
      borderRight: "none",
      borderBottom: "none",
      borderLeft: `3px solid ${isActive ? color : "#1c1d26"}`,
      paddingLeft: "16px",
      opacity: displayedChars === 0 && !isActive ? 0.3 : 1,
      transition: "opacity 0.3s",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <span style={{ fontSize: "16px" }}>{icon}</span>
        <span style={{ fontSize: "13px", fontWeight: 600, color }}>
          {name}
        </span>
        <span style={{ fontSize: "11px", color: "#555565" }}>
          Round {round.round} · {round.phase.toUpperCase()}
        </span>
        <span style={{ fontSize: "10px", color: "#555565", marginLeft: "auto" }}>
          {round.model}
        </span>
        {isActive && (
          <div style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: color, animation: "pulse 1.5s ease infinite",
          }} />
        )}
      </div>

      {/* Output */}
      <pre
        ref={outputRef}
        style={{
          background: "#0a0a0e",
          borderTop: `1px solid ${color}30`,
          borderRight: `1px solid ${color}30`,
          borderBottom: `1px solid ${color}30`,
          borderLeft: "none",
          borderRadius: "0 8px 8px 0",
          padding: "12px 14px",
          fontSize: "12px",
          lineHeight: 1.6,
          color: "#c0c0d0",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: "300px",
          overflow: "auto",
          fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
        }}
      >
        {visibleText}
        {isActive && <span style={{ color, animation: "blink 1s step-end infinite" }}>▌</span>}
      </pre>

      {/* Verdict badge for QA phases */}
      {isQA && displayedChars >= round.outputPreview.length && round.verdict && (
        <div style={{
          marginTop: "8px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "12px",
          fontWeight: 600,
        }}>
          {round.verdict.toLowerCase().includes("pass") ? (
            <><CheckCircle size={14} color="#22c55e" /><span style={{ color: "#22c55e" }}>{round.verdict}</span></>
          ) : round.verdict.toLowerCase().includes("fail") ? (
            <><XCircle size={14} color="#ef4444" /><span style={{ color: "#ef4444" }}>{round.verdict}</span></>
          ) : (
            <><AlertTriangle size={14} color="#eab308" /><span style={{ color: "#eab308" }}>{round.verdict}</span></>
          )}
          {round.defectCount !== undefined && round.defectCount > 0 && (
            <span style={{ color: "#555565", fontWeight: 400 }}>
              · {round.defectCount} defect{round.defectCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Demo Page ───

export default function DemoPage() {
  const [sprints, setSprints] = useState<SprintSummary[]>([]);
  const [activeSprint, setActiveSprint] = useState<DemoSprint | null>(null);
  const [loading, setLoading] = useState(true);

  // Replay state
  const [playing, setPlaying] = useState(false);
  const [currentPhaseIdx, setCurrentPhaseIdx] = useState(0);
  const [displayedChars, setDisplayedChars] = useState(0);
  const [phaseComplete, setPhaseComplete] = useState<Set<number>>(new Set());
  const animRef = useRef<number | null>(null);

  // Load sprint list
  useEffect(() => {
    fetch("/api/demo")
      .then(r => r.json())
      .then(data => {
        setSprints(data.sprints ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Load specific sprint
  const loadSprint = async (id: string) => {
    const res = await fetch(`/api/demo?id=${encodeURIComponent(id)}`);
    const data = await res.json();
    setActiveSprint(data);
    resetReplay();
  };

  const resetReplay = () => {
    setCurrentPhaseIdx(0);
    setDisplayedChars(0);
    setPhaseComplete(new Set());
    setPlaying(false);
    if (animRef.current) cancelAnimationFrame(animRef.current);
  };

  // Animation loop
  useEffect(() => {
    if (!playing || !activeSprint || activeSprint.rounds.length === 0) return;

    const currentRound = activeSprint.rounds[currentPhaseIdx];
    if (!currentRound) {
      setPlaying(false);
      return;
    }

    const totalChars = currentRound.outputPreview.length;

    const tick = () => {
      setDisplayedChars(prev => {
        const next = prev + TYPING_SPEED;
        if (next >= totalChars) {
          // Phase complete
          setPhaseComplete(s => new Set(s).add(currentPhaseIdx));

          // Move to next phase after pause
          setTimeout(() => {
            if (currentPhaseIdx < activeSprint.rounds.length - 1) {
              setCurrentPhaseIdx(i => i + 1);
              setDisplayedChars(0);
            } else {
              setPlaying(false); // Done
            }
          }, PHASE_PAUSE);

          return totalChars;
        }
        animRef.current = requestAnimationFrame(tick);
        return next;
      });
    };

    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [playing, currentPhaseIdx, activeSprint]);

  const skipPhase = () => {
    if (!activeSprint) return;
    const currentRound = activeSprint.rounds[currentPhaseIdx];
    if (!currentRound) return;

    setDisplayedChars(currentRound.outputPreview.length);
    setPhaseComplete(s => new Set(s).add(currentPhaseIdx));

    if (currentPhaseIdx < activeSprint.rounds.length - 1) {
      setTimeout(() => {
        setCurrentPhaseIdx(i => i + 1);
        setDisplayedChars(0);
      }, 200);
    } else {
      setPlaying(false);
    }
  };

  // Auto-load first sprint
  useEffect(() => {
    if (sprints.length > 0 && !activeSprint) {
      // Pick a good demo sprint — prefer one with 2+ rounds
      const good = sprints.find(s => s.iterations >= 2 && s.status === "passed") ?? sprints[0];
      loadSprint(good.id);
    }
  }, [sprints]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a0a0e" }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>

      {/* Sprint list sidebar */}
      <div style={{
        width: "260px",
        borderRight: "1px solid #1c1d26",
        background: "#0f1116",
        overflow: "auto",
        flexShrink: 0,
      }}>
        <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid #1c1d26" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <Zap size={16} color="#fb923c" />
            <span style={{ fontSize: "15px", fontWeight: 700, color: "#e0e0e8" }}>MAH Demo</span>
          </div>
          <p style={{ margin: 0, fontSize: "11px", color: "#555565" }}>
            {sprints.length} sprints · real execution data
          </p>
        </div>

        <div style={{ padding: "8px 0" }}>
          {loading ? (
            <div style={{ padding: "20px", color: "#555565", fontSize: "12px", textAlign: "center" }}>Loading...</div>
          ) : (
            sprints.map(s => (
              <SprintListItem
                key={s.id}
                sprint={s}
                active={activeSprint?.id === s.id}
                onClick={() => loadSprint(s.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Main replay area */}
      <div style={{ flex: 1, padding: "28px 32px", overflow: "auto" }}>
        {!activeSprint ? (
          <div style={{ color: "#555565", fontSize: "14px", padding: "40px", textAlign: "center" }}>
            Select a sprint to replay
          </div>
        ) : (
          <>
            {/* Sprint header */}
            <div style={{ marginBottom: "24px" }}>
              <h1 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 700, color: "#e0e0e8" }}>
                {activeSprint.name}
              </h1>
              <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#9ca3af", lineHeight: 1.5 }}>
                {activeSprint.task}
              </p>

              {/* Metrics bar */}
              {activeSprint.metrics && (
                <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                  <MetricPill icon={Clock} label="Duration" value={formatDuration(activeSprint.metrics.totalDurationMs)} />
                  <MetricPill icon={DollarSign} label="Cost" value={`$${activeSprint.metrics.estimatedCost.toFixed(4)}`} />
                  <MetricPill icon={Bug} label="Defects" value={`${activeSprint.metrics.defectsFound} found, ${activeSprint.metrics.defectsFixed} fixed`} />
                  <MetricPill
                    icon={activeSprint.status === "passed" ? CheckCircle : XCircle}
                    label="Verdict"
                    value={activeSprint.status.toUpperCase()}
                    color={activeSprint.status === "passed" ? "#22c55e" : "#ef4444"}
                  />
                </div>
              )}
            </div>

            {/* Playback controls */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "20px",
              padding: "10px 14px",
              background: "#0f1116",
              borderRadius: "10px",
              border: "1px solid #1c1d26",
            }}>
              <button
                onClick={() => setPlaying(!playing)}
                style={{
                  background: playing ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
                  border: `1px solid ${playing ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.4)"}`,
                  borderRadius: "8px",
                  padding: "6px 14px",
                  color: playing ? "#ef4444" : "#22c55e",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                {playing ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
              </button>
              <button
                onClick={skipPhase}
                style={{
                  background: "transparent",
                  border: "1px solid #1c1d26",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  color: "#9ca3af",
                  fontSize: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <SkipForward size={12} /> Skip
              </button>
              <button
                onClick={resetReplay}
                style={{
                  background: "transparent",
                  border: "1px solid #1c1d26",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  color: "#9ca3af",
                  fontSize: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <RotateCcw size={12} /> Reset
              </button>
              <div style={{ marginLeft: "auto", fontSize: "11px", color: "#555565" }}>
                Phase {currentPhaseIdx + 1} / {activeSprint.rounds.length}
              </div>
            </div>

            {/* Phase blocks */}
            {activeSprint.rounds.map((round, idx) => (
              <PhaseBlock
                key={`${round.phase}-${round.round}-${idx}`}
                round={round}
                isActive={idx === currentPhaseIdx && playing}
                displayedChars={
                  idx < currentPhaseIdx || phaseComplete.has(idx)
                    ? round.outputPreview.length
                    : idx === currentPhaseIdx
                    ? displayedChars
                    : 0
                }
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Small components ───

function MetricPill({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <Icon size={13} color={color ?? "#555565"} />
      <span style={{ fontSize: "11px", color: "#555565" }}>{label}:</span>
      <span style={{ fontSize: "12px", fontWeight: 600, color: color ?? "#e0e0e8" }}>{value}</span>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}
