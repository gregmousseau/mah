"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import VerdictBadge from "@/components/VerdictBadge";
import type { SprintSummary, SprintContract, SprintMetrics } from "@/types/mah";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDuration(ms?: number) {
  if (!ms) return "—";
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatCost(n?: number) {
  if (n == null) return "—";
  return `$${n.toFixed(3)}`;
}

function diffSign(delta: number): string {
  if (delta > 0) return `+${delta.toFixed(3)}`;
  return delta.toFixed(3);
}

function isPass(verdict?: string) {
  return verdict === "pass" || verdict === "passed";
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const BG = "#0a0a0e";
const CARD = "#0f1116";
const BORDER = "#1c1d26";
const ACCENT = "#fb923c";
const TEXT = "#e0e0e8";
const MUTED = "#9ca3af";
const SUCCESS = "#22c55e";
const FAIL = "#ef4444";

// ─── Sprint Card ─────────────────────────────────────────────────────────────

interface SprintData {
  contract: SprintContract;
  metrics: SprintMetrics | null;
}

function SprintCard({ data, label }: { data: SprintData; label: string }) {
  const { contract, metrics } = data;
  const cost = metrics?.totals.estimatedCost;
  const durationMs = metrics?.totals.durationMs;
  const iterations = metrics?.totals.iterations ?? contract.iterations.length;

  return (
    <div style={{
      background: CARD,
      border: `1px solid ${BORDER}`,
      borderRadius: "12px",
      padding: "24px",
      flex: 1,
      minWidth: 0,
    }}>
      {/* Label */}
      <div style={{
        fontSize: "10px",
        fontWeight: 700,
        color: ACCENT,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        marginBottom: "12px",
      }}>
        {label}
      </div>

      {/* Name + verdict */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
        <Link
          href={`/sprints/${contract.id}`}
          style={{ color: TEXT, fontWeight: 600, fontSize: "15px", textDecoration: "none" }}
        >
          {contract.name}
        </Link>
        <VerdictBadge verdict={contract.status} />
      </div>

      {/* Date */}
      <div style={{ fontSize: "12px", color: MUTED, marginBottom: "16px" }}>
        {formatDate(contract.createdAt)}
        {contract.completedAt && ` → ${formatDate(contract.completedAt)}`}
      </div>

      {/* Metrics row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "12px",
        marginBottom: "16px",
      }}>
        {[
          { label: "Cost", value: formatCost(cost) },
          { label: "Duration", value: formatDuration(durationMs) },
          { label: "Iterations", value: String(iterations) },
        ].map(({ label: l, value }) => (
          <div key={l} style={{
            background: BG,
            border: `1px solid ${BORDER}`,
            borderRadius: "8px",
            padding: "10px 12px",
          }}>
            <div style={{ fontSize: "10px", color: MUTED, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: l === "Cost" ? ACCENT : TEXT }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Agent info */}
      {contract.agentConfig && (
        <div style={{
          fontSize: "12px",
          color: MUTED,
          marginBottom: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}>
          <div>
            <span style={{ color: "#555565" }}>Generator: </span>
            {contract.agentConfig.generator.agentName}
          </div>
          <div>
            <span style={{ color: "#555565" }}>Evaluator: </span>
            {contract.agentConfig.evaluator.agentName}
          </div>
        </div>
      )}

      {/* Task */}
      <div style={{
        fontSize: "12px",
        color: MUTED,
        background: BG,
        border: `1px solid ${BORDER}`,
        borderRadius: "8px",
        padding: "10px 12px",
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {contract.task}
      </div>
    </div>
  );
}

// ─── Diff Summary ─────────────────────────────────────────────────────────────

function DiffRow({
  label,
  leftVal,
  rightVal,
  delta,
  lowerIsBetter = true,
}: {
  label: string;
  leftVal: string;
  rightVal: string;
  delta: number | null;
  lowerIsBetter?: boolean;
}) {
  let winnerColor = MUTED;
  let winnerLabel = "";
  if (delta !== null && Math.abs(delta) > 0.0001) {
    const rightIsBetter = lowerIsBetter ? delta < 0 : delta > 0;
    winnerColor = rightIsBetter ? SUCCESS : FAIL;
    winnerLabel = rightIsBetter ? "← right wins" : "← left wins";
  } else if (delta !== null) {
    winnerLabel = "tied";
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "140px 1fr 1fr 100px 120px",
      gap: "12px",
      alignItems: "center",
      padding: "12px 16px",
      borderBottom: `1px solid ${BORDER}`,
    }}>
      <div style={{ fontSize: "12px", color: MUTED, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: "13px", color: TEXT }}>{leftVal}</div>
      <div style={{ fontSize: "13px", color: TEXT }}>{rightVal}</div>
      <div style={{ fontSize: "12px", color: delta !== null ? (delta > 0 ? FAIL : delta < 0 ? SUCCESS : MUTED) : MUTED, fontFamily: "monospace" }}>
        {delta !== null ? diffSign(delta) : "—"}
      </div>
      <div style={{ fontSize: "11px", color: winnerColor, fontWeight: 600 }}>{winnerLabel}</div>
    </div>
  );
}

function StatusRow({ leftVerdict, rightVerdict }: { leftVerdict: string; rightVerdict: string }) {
  const leftPass = isPass(leftVerdict);
  const rightPass = isPass(rightVerdict);
  const bothPass = leftPass && rightPass;
  const bothFail = !leftPass && !rightPass;

  let summary = "";
  let summaryColor = MUTED;
  if (bothPass) { summary = "Both passed"; summaryColor = SUCCESS; }
  else if (bothFail) { summary = "Both failed"; summaryColor = FAIL; }
  else if (leftPass && !rightPass) { summary = "Left passed, right failed"; summaryColor = MUTED; }
  else { summary = "Right passed, left failed"; summaryColor = MUTED; }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "140px 1fr 1fr 100px 120px",
      gap: "12px",
      alignItems: "center",
      padding: "12px 16px",
    }}>
      <div style={{ fontSize: "12px", color: MUTED, fontWeight: 500 }}>Status</div>
      <div><VerdictBadge verdict={leftVerdict} /></div>
      <div><VerdictBadge verdict={rightVerdict} /></div>
      <div />
      <div style={{ fontSize: "11px", color: summaryColor, fontWeight: 600 }}>{summary}</div>
    </div>
  );
}

function DiffSummary({ left, right }: { left: SprintData; right: SprintData }) {
  const lCost = left.metrics?.totals.estimatedCost ?? 0;
  const rCost = right.metrics?.totals.estimatedCost ?? 0;
  const lDur = left.metrics?.totals.durationMs ?? 0;
  const rDur = right.metrics?.totals.durationMs ?? 0;
  const lIter = left.metrics?.totals.iterations ?? left.contract.iterations.length;
  const rIter = right.metrics?.totals.iterations ?? right.contract.iterations.length;

  const costDelta = lCost && rCost ? rCost - lCost : null;
  const durDelta = lDur && rDur ? rDur - lDur : null;
  const iterDelta = rIter - lIter;

  return (
    <div style={{
      background: CARD,
      border: `1px solid ${BORDER}`,
      borderRadius: "12px",
      overflow: "hidden",
      marginTop: "24px",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        borderBottom: `1px solid ${BORDER}`,
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}>
        <span style={{ fontSize: "15px", fontWeight: 600, color: TEXT }}>Diff Summary</span>
      </div>

      {/* Column headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr 1fr 100px 120px",
        gap: "12px",
        padding: "10px 16px 6px",
        fontSize: "10px",
        color: "#555565",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}>
        <div>Metric</div>
        <div>Left</div>
        <div>Right</div>
        <div>Delta (R−L)</div>
        <div>Winner</div>
      </div>

      <DiffRow
        label="Cost"
        leftVal={formatCost(lCost || undefined)}
        rightVal={formatCost(rCost || undefined)}
        delta={costDelta}
        lowerIsBetter
      />
      <DiffRow
        label="Duration"
        leftVal={formatDuration(lDur || undefined)}
        rightVal={formatDuration(rDur || undefined)}
        delta={durDelta !== null ? durDelta / 60000 : null}
        lowerIsBetter
      />
      <DiffRow
        label="Iterations"
        leftVal={String(lIter)}
        rightVal={String(rIter)}
        delta={iterDelta}
        lowerIsBetter
      />
      <StatusRow
        leftVerdict={left.contract.status}
        rightVerdict={right.contract.status}
      />
    </div>
  );
}

// ─── Picker ───────────────────────────────────────────────────────────────────

function SprintPicker() {
  const router = useRouter();
  const [sprints, setSprints] = useState<SprintSummary[]>([]);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sprints")
      .then((r) => r.json())
      .then((data) => { setSprints(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function handleCompare() {
    if (left && right) {
      router.push(`/sprints/compare?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}`);
    }
  }

  const selectStyle: React.CSSProperties = {
    background: "#14151b",
    border: `1px solid ${BORDER}`,
    borderRadius: "8px",
    padding: "10px 14px",
    color: TEXT,
    fontSize: "13px",
    cursor: "pointer",
    outline: "none",
    width: "100%",
  };

  return (
    <div style={{ padding: "32px", maxWidth: "600px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href="/sprints" style={{ fontSize: "12px", color: MUTED, textDecoration: "none" }}>
          ← Sprints
        </Link>
      </div>
      <h1 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: 700, color: TEXT }}>Compare Sprints</h1>
      <p style={{ margin: "0 0 28px", fontSize: "13px", color: MUTED }}>
        Select two sprints to compare side-by-side.
      </p>

      {loading ? (
        <div style={{ color: MUTED, fontSize: "13px" }}>Loading sprints…</div>
      ) : (
        <div style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: "12px",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: MUTED, fontWeight: 600, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Left Sprint
            </label>
            <select value={left} onChange={(e) => setLeft(e.target.value)} style={selectStyle}>
              <option value="">— select sprint —</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>#{s.id} {s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: MUTED, fontWeight: 600, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Right Sprint
            </label>
            <select value={right} onChange={(e) => setRight(e.target.value)} style={selectStyle}>
              <option value="">— select sprint —</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>#{s.id} {s.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleCompare}
            disabled={!left || !right || left === right}
            style={{
              background: left && right && left !== right ? ACCENT : "#2a2b36",
              color: left && right && left !== right ? "#000" : MUTED,
              border: "none",
              borderRadius: "8px",
              padding: "11px 20px",
              fontSize: "13px",
              fontWeight: 700,
              cursor: left && right && left !== right ? "pointer" : "not-allowed",
              transition: "all 0.15s",
              alignSelf: "flex-start",
            }}
          >
            Compare →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Comparison View ──────────────────────────────────────────────────────────

function CompareView({ leftId, rightId }: { leftId: string; rightId: string }) {
  const [leftData, setLeftData] = useState<SprintData | null>(null);
  const [rightData, setRightData] = useState<SprintData | null>(null);
  const [leftError, setLeftError] = useState(false);
  const [rightError, setRightError] = useState(false);

  useEffect(() => {
    fetch(`/api/sprints/${encodeURIComponent(leftId)}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(setLeftData)
      .catch(() => setLeftError(true));
  }, [leftId]);

  useEffect(() => {
    fetch(`/api/sprints/${encodeURIComponent(rightId)}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(setRightData)
      .catch(() => setRightError(true));
  }, [rightId]);

  const loading = !leftData && !leftError || !rightData && !rightError;

  return (
    <div style={{ padding: "32px", maxWidth: "1100px" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
        <Link href="/sprints" style={{ fontSize: "12px", color: MUTED, textDecoration: "none" }}>
          ← Sprints
        </Link>
        <span style={{ color: BORDER }}>|</span>
        <Link href="/sprints/compare" style={{ fontSize: "12px", color: MUTED, textDecoration: "none" }}>
          Compare
        </Link>
      </div>

      <h1 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 700, color: TEXT }}>Sprint Comparison</h1>
      <div style={{ fontSize: "13px", color: MUTED, marginBottom: "28px" }}>
        #{leftId} vs #{rightId}
      </div>

      {loading && (
        <div style={{ color: MUTED, fontSize: "13px" }}>Loading sprints…</div>
      )}

      {(leftError || rightError) && (
        <div style={{
          background: "rgba(239,68,68,0.08)",
          border: `1px solid rgba(239,68,68,0.25)`,
          borderRadius: "10px",
          padding: "16px 20px",
          color: FAIL,
          fontSize: "13px",
          marginBottom: "16px",
        }}>
          {leftError && `Could not load sprint #${leftId}. `}
          {rightError && `Could not load sprint #${rightId}.`}
        </div>
      )}

      {leftData && rightData && (
        <>
          {/* Side-by-side cards */}
          <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
            <SprintCard data={leftData} label="Left" />
            <SprintCard data={rightData} label="Right" />
          </div>

          {/* Diff summary */}
          <DiffSummary left={leftData} right={rightData} />
        </>
      )}
    </div>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

function ComparePageInner() {
  const searchParams = useSearchParams();
  const leftId = searchParams.get("left");
  const rightId = searchParams.get("right");

  if (!leftId || !rightId) {
    return <SprintPicker />;
  }

  return <CompareView leftId={leftId} rightId={rightId} />;
}

export default function ComparePageWrapper() {
  return (
    <Suspense fallback={
      <div style={{ padding: "32px", color: MUTED, fontSize: "13px" }}>Loading…</div>
    }>
      <ComparePageInner />
    </Suspense>
  );
}
