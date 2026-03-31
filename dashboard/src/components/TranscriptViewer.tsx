"use client";

import { useState, useCallback } from "react";
import type { SprintTranscript, TranscriptPhase } from "@/types/mah";

function formatDuration(startTime: string, endTime: string): string {
  const ms = new Date(endTime).getTime() - new Date(startTime).getTime();
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function phaseLabel(phase: TranscriptPhase): string {
  const actor = phase.actor.charAt(0).toUpperCase() + phase.actor.slice(1);
  const p = phase.phase.charAt(0).toUpperCase() + phase.phase.slice(1);
  return `${p} R${phase.round} — ${actor}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      style={{
        background: "none",
        border: "1px solid #1c1d26",
        borderRadius: "4px",
        color: copied ? "#22c55e" : "#9ca3af",
        cursor: "pointer",
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.05em",
        padding: "3px 8px",
        textTransform: "uppercase",
        transition: "color 0.15s, border-color 0.15s",
      }}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

interface CodePanelProps {
  label: string;
  content: string;
  accentColor: string;
}

function CodePanel({ label, content, accentColor }: CodePanelProps) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        borderLeft: `3px solid ${accentColor}`,
        background: "#0d0d18",
        borderRadius: "0 6px 6px 0",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid #1e1e2e",
          background: "#111122",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: accentColor,
          }}
        >
          {label}
        </span>
        <CopyButton text={content} />
      </div>
      <pre
        style={{
          margin: 0,
          padding: "14px",
          fontSize: "12px",
          lineHeight: 1.65,
          color: "#c0c0cc",
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflowX: "auto",
          maxHeight: "320px",
          overflowY: "auto",
        }}
      >
        {content}
      </pre>
    </div>
  );
}

interface PhaseCardProps {
  phase: TranscriptPhase;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function PhaseCard({ phase, index, isExpanded, onToggle }: PhaseCardProps) {
  const duration = formatDuration(phase.startTime, phase.endTime);
  const cost = phase.costEstimate != null ? `$${phase.costEstimate.toFixed(2)}` : null;
  const tokens = phase.tokenUsage
    ? `${(phase.tokenUsage.input + phase.tokenUsage.output).toLocaleString()} tokens`
    : null;

  const phaseColor = phase.phase === "dev" ? "#3b82f6" : phase.phase === "qa" ? "#fb923c" : "#fb923c";

  return (
    <div
      style={{
        border: "1px solid #1c1d26",
        borderRadius: "10px",
        overflow: "hidden",
        background: "#0f0f1e",
      }}
    >
      {/* Phase header — always visible */}
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          textAlign: "left",
        }}
      >
        {/* Phase number pill */}
        <span
          style={{
            minWidth: "22px",
            height: "22px",
            borderRadius: "50%",
            background: phaseColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "10px",
            fontWeight: 700,
            color: "#fff",
            flexShrink: 0,
          }}
        >
          {index + 1}
        </span>

        {/* Label */}
        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "#e0e0e8",
            flex: 1,
          }}
        >
          {phaseLabel(phase)}
        </span>

        {/* Meta chips */}
        <span style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
          <span
            style={{
              fontSize: "11px",
              color: "#9ca3af",
              background: "#1a1a2e",
              padding: "2px 8px",
              borderRadius: "12px",
              whiteSpace: "nowrap",
            }}
          >
            {phase.model}
          </span>
          <span style={{ fontSize: "11px", color: "#9ca3af", whiteSpace: "nowrap" }}>
            {duration}
          </span>
          {cost && (
            <span
              style={{
                fontSize: "11px",
                color: "#fb923c",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {cost}
            </span>
          )}
          <span
            style={{
              fontSize: "11px",
              color: "#555565",
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
              display: "inline-block",
            }}
          >
            ›
          </span>
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{ borderTop: "1px solid #1e1e2e" }}>
          {/* Panels — side by side on desktop, stacked on mobile */}
          <div
            style={{
              display: "flex",
              gap: "0",
              flexWrap: "wrap",
            }}
          >
            <style>{`
              @media (max-width: 640px) {
                .transcript-panels { flex-direction: column !important; }
                .transcript-panels > div { border-left: 3px solid var(--accent-color) !important; margin-bottom: 1px; }
              }
            `}</style>
            <div
              className="transcript-panels"
              style={{
                display: "flex",
                gap: "1px",
                width: "100%",
                background: "#1e1e2e",
              }}
            >
              <CodePanel
                label="Prompt Sent"
                content={phase.promptSent}
                accentColor="#3b82f6"
              />
              <CodePanel
                label="Response"
                content={phase.responseReceived}
                accentColor="#fb923c"
              />
            </div>
          </div>

          {/* Footer with token/cost info */}
          {(tokens || cost) && (
            <div
              style={{
                padding: "8px 16px",
                borderTop: "1px solid #1e1e2e",
                display: "flex",
                gap: "16px",
                fontSize: "11px",
                color: "#555565",
                background: "#0d0d18",
              }}
            >
              {phase.tokenUsage && (
                <>
                  <span>↑ {phase.tokenUsage.input.toLocaleString()} in</span>
                  <span>↓ {phase.tokenUsage.output.toLocaleString()} out</span>
                </>
              )}
              {cost && (
                <span style={{ color: "#fb923c", marginLeft: "auto" }}>
                  {cost}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TranscriptViewerProps {
  sprintId: string;
}

export default function TranscriptViewer({ sprintId }: TranscriptViewerProps) {
  const [sectionOpen, setSectionOpen] = useState(false);
  const [transcript, setTranscript] = useState<SprintTranscript | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);

  // Lazy load transcript when section first opens
  const handleSectionToggle = useCallback(async () => {
    const opening = !sectionOpen;
    setSectionOpen(opening);

    if (opening && transcript === undefined) {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`/api/sprints/${sprintId}/transcript`);
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        setTranscript(data); // null = no transcript available
      } catch {
        setError(true);
        setTranscript(null);
      } finally {
        setLoading(false);
      }
    }
  }, [sectionOpen, transcript, sprintId]);

  const togglePhase = useCallback((index: number) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    if (!transcript) return;
    if (allExpanded) {
      setExpandedPhases(new Set());
      setAllExpanded(false);
    } else {
      setExpandedPhases(new Set(transcript.phases.map((_, i) => i)));
      setAllExpanded(true);
    }
  }, [allExpanded, transcript]);

  return (
    <div style={{ marginBottom: "28px" }}>
      {/* Section header — always visible */}
      <button
        onClick={handleSectionToggle}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: sectionOpen ? "16px" : "0",
          padding: "0",
          textAlign: "left",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "15px",
            fontWeight: 600,
            color: "#e0e0e8",
            flex: 1,
          }}
        >
          Transcript
        </h2>
        <span
          style={{
            fontSize: "12px",
            color: "#9ca3af",
            transform: sectionOpen ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
            display: "inline-block",
          }}
        >
          ›
        </span>
      </button>

      {sectionOpen && (
        <div>
          {loading && (
            <div
              style={{
                padding: "24px",
                textAlign: "center",
                color: "#9ca3af",
                fontSize: "13px",
                background: "#0f1116",
                border: "1px solid #1c1d26",
                borderRadius: "10px",
              }}
            >
              Loading transcript…
            </div>
          )}

          {error && (
            <div
              style={{
                padding: "20px",
                color: "#ef4444",
                fontSize: "13px",
                background: "#0f1116",
                border: "1px solid #1c1d26",
                borderRadius: "10px",
              }}
            >
              Failed to load transcript.
            </div>
          )}

          {!loading && !error && transcript === null && (
            <div
              style={{
                padding: "20px",
                color: "#555565",
                fontSize: "13px",
                background: "#0f1116",
                border: "1px solid #1c1d26",
                borderRadius: "10px",
                fontStyle: "italic",
              }}
            >
              No transcript available for this sprint.
            </div>
          )}

          {!loading && transcript && transcript.phases.length > 0 && (
            <>
              {/* Expand/Collapse all */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginBottom: "12px",
                }}
              >
                <button
                  onClick={handleExpandAll}
                  style={{
                    background: "none",
                    border: "1px solid #1c1d26",
                    borderRadius: "6px",
                    color: "#9ca3af",
                    cursor: "pointer",
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    padding: "5px 12px",
                    textTransform: "uppercase",
                  }}
                >
                  {allExpanded ? "Collapse All" : "Expand All"}
                </button>
              </div>

              {/* Phase cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {transcript.phases.map((phase, i) => (
                  <PhaseCard
                    key={i}
                    phase={phase}
                    index={i}
                    isExpanded={expandedPhases.has(i)}
                    onToggle={() => togglePhase(i)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
