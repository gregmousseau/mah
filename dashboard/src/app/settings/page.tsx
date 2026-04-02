"use client";

import { useState, useEffect } from "react";
import { Settings, Users, Sliders, Bell } from "lucide-react";
import { usePolling } from "@/hooks/usePolling";
import type { MahConfig } from "@/types/mah";
import type { AgentDefinition } from "@/lib/agents";

// ─── Styles ───────────────────────────────────────────────────────────────────

const BG = "#0a0a0e";
const CARD = "#0f1116";
const BORDER = "#1c1d26";
const ACCENT = "#fb923c";
const TEXT = "#e0e0e8";
const MUTED = "#9ca3af";

const card: React.CSSProperties = {
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: "12px",
  padding: "24px",
  marginBottom: "20px",
};

const sectionTitle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  fontSize: "15px",
  fontWeight: 700,
  color: TEXT,
  marginBottom: "20px",
};

const label: React.CSSProperties = {
  fontSize: "12px",
  color: MUTED,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
  marginBottom: "6px",
};

const readonlyField: React.CSSProperties = {
  background: "#0a0a0e",
  border: `1px solid ${BORDER}`,
  borderRadius: "8px",
  padding: "9px 12px",
  fontSize: "13px",
  color: TEXT,
  width: "100%",
  boxSizing: "border-box" as const,
};

const inputStyle: React.CSSProperties = {
  background: "#0a0a0e",
  border: `1px solid ${BORDER}`,
  borderRadius: "8px",
  padding: "9px 12px",
  fontSize: "13px",
  color: TEXT,
  width: "100%",
  boxSizing: "border-box" as const,
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  background: ACCENT,
  color: "white",
  border: "none",
  borderRadius: "8px",
  padding: "9px 18px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "transparent",
  color: MUTED,
  border: `1px solid ${BORDER}`,
  borderRadius: "8px",
  padding: "9px 18px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

// ─── General Settings ─────────────────────────────────────────────────────────

function GeneralSection({ config }: { config: MahConfig | null }) {
  return (
    <div style={card}>
      <div style={sectionTitle}>
        <Settings size={16} color={ACCENT} />
        General Settings
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div>
          <div style={label}>Project Name</div>
          <div style={readonlyField}>{config?.project?.name || "—"}</div>
        </div>
        <div>
          <div style={label}>MAH Version</div>
          <div style={readonlyField}>v0.1.0</div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={label}>Repository</div>
          <div style={readonlyField}>{config?.project?.repo || "—"}</div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={label}>Sprint Data Directory</div>
          <div style={{ ...readonlyField, fontFamily: "monospace", fontSize: "12px", color: ACCENT }}>
            .mah/sprints/
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Configuration ──────────────────────────────────────────────────────

interface AddAgentForm {
  name: string;
  role: string;
  platform: "claude" | "codex" | "opencode";
  workspace: string;
}

function AgentSection() {
  const { data, refetch } = usePolling<{ agents: AgentDefinition[] }>("/api/agents", 30000);
  const agents = data?.agents || [];

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<AddAgentForm>({ name: "", role: "", platform: "claude", workspace: "" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleAddAgent(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, role: form.role, platform: form.platform }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add agent");
      setSuccess(json.message || "Agent configuration sprint created");
      setForm({ name: "", role: "", platform: "claude", workspace: "" });
      setShowForm(false);
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ ...sectionTitle, marginBottom: "16px" }}>
        <Users size={16} color={ACCENT} />
        Agent Configuration
        <button
          onClick={() => { setShowForm((v) => !v); setError(null); setSuccess(null); }}
          style={{ ...btnPrimary, marginLeft: "auto", padding: "6px 14px", fontSize: "12px" }}
        >
          {showForm ? "Cancel" : "+ Add Agent"}
        </button>
      </div>

      {success && (
        <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "#22c55e", marginBottom: "16px" }}>
          {success}
        </div>
      )}

      {/* Inline Add Form */}
      {showForm && (
        <form
          onSubmit={handleAddAgent}
          style={{ background: "#0a0a0e", border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "16px", marginBottom: "16px" }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <div style={label}>Name</div>
              <input
                style={inputStyle}
                placeholder="e.g. Aria"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <div style={label}>Role</div>
              <input
                style={inputStyle}
                placeholder="e.g. Data analyst"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                required
              />
            </div>
            <div>
              <div style={label}>Platform</div>
              <select
                style={selectStyle}
                value={form.platform}
                onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as AddAgentForm["platform"] }))}
              >
                <option value="claude">claude</option>
                <option value="codex">codex</option>
                <option value="opencode">opencode</option>
              </select>
            </div>
            <div>
              <div style={label}>Workspace Path</div>
              <input
                style={inputStyle}
                placeholder="e.g. /home/user/.openclaw/workspace-aria"
                value={form.workspace}
                onChange={(e) => setForm((f) => ({ ...f, workspace: e.target.value }))}
              />
            </div>
          </div>
          {error && (
            <div style={{ fontSize: "12px", color: "#f87171", marginBottom: "10px" }}>{error}</div>
          )}
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="submit" style={btnPrimary} disabled={submitting}>
              {submitting ? "Creating…" : "Create Agent Sprint"}
            </button>
            <button type="button" style={btnSecondary} onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Agent list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {agents.length === 0 ? (
          <div style={{ fontSize: "13px", color: MUTED, padding: "12px 0" }}>No agents registered.</div>
        ) : (
          agents.map((agent) => (
            <div
              key={agent.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 14px",
                background: "#0a0a0e",
                border: `1px solid ${BORDER}`,
                borderRadius: "8px",
              }}
            >
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: agent.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: TEXT }}>{agent.name}</span>
                  <span style={{ fontSize: "11px", color: MUTED, background: `${BORDER}`, border: `1px solid ${BORDER}`, borderRadius: "4px", padding: "1px 6px" }}>
                    {agent.role}
                  </span>
                  {agent.isEvaluator && (
                    <span style={{ fontSize: "10px", color: ACCENT, background: `${ACCENT}18`, border: `1px solid ${ACCENT}40`, borderRadius: "4px", padding: "1px 6px" }}>
                      evaluator
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "11px", color: "#555565", fontFamily: "monospace", marginTop: "3px" }}>
                  {agent.workspace}
                </div>
              </div>
              <div style={{ fontSize: "11px", color: MUTED, flexShrink: 0 }}>{agent.platform}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Execution Defaults ───────────────────────────────────────────────────────

function ExecutionSection({ config }: { config: MahConfig | null }) {
  const [maxRetries, setMaxRetries] = useState(3);
  const [defaultTier, setDefaultTier] = useState("targeted");
  const [concurrentLimit, setConcurrentLimit] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) {
      setDefaultTier(config.qa?.defaultTier || "targeted");
      setMaxRetries(config.qa?.maxIterations || 3);
    }
  }, [config]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxRetries, defaultTier, concurrentLimit }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={card}>
      <div style={sectionTitle}>
        <Sliders size={16} color={ACCENT} />
        Execution Defaults
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "20px" }}>
        <div>
          <div style={label}>Max Retries</div>
          <input
            type="number"
            min={1}
            max={10}
            style={inputStyle}
            value={maxRetries}
            onChange={(e) => setMaxRetries(Number(e.target.value))}
          />
        </div>
        <div>
          <div style={label}>Default QA Tier</div>
          <select
            style={selectStyle}
            value={defaultTier}
            onChange={(e) => setDefaultTier(e.target.value)}
          >
            <option value="smoke">smoke</option>
            <option value="targeted">targeted</option>
            <option value="full">full</option>
          </select>
        </div>
        <div>
          <div style={label}>Concurrent Sprint Limit</div>
          <input
            type="number"
            min={1}
            max={10}
            style={inputStyle}
            value={concurrentLimit}
            onChange={(e) => setConcurrentLimit(Number(e.target.value))}
          />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button style={btnPrimary} onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span style={{ fontSize: "13px", color: "#22c55e" }}>Saved</span>}
      </div>
    </div>
  );
}

// ─── Notifications ────────────────────────────────────────────────────────────

const LS_KEY = "mah_notifications";

interface NotifPrefs {
  onComplete: boolean;
  onFail: boolean;
  channel: string;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: "40px",
        height: "22px",
        borderRadius: "11px",
        border: "none",
        cursor: "pointer",
        background: checked ? ACCENT : BORDER,
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute",
        top: "3px",
        left: checked ? "21px" : "3px",
        width: "16px",
        height: "16px",
        borderRadius: "50%",
        background: "white",
        transition: "left 0.2s",
      }} />
    </button>
  );
}

function NotificationsSection() {
  const [prefs, setPrefs] = useState<NotifPrefs>({ onComplete: true, onFail: true, channel: "" });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) setPrefs(JSON.parse(stored));
    } catch {}
  }, []);

  function update(patch: Partial<NotifPrefs>) {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  return (
    <div style={card}>
      <div style={sectionTitle}>
        <Bell size={16} color={ACCENT} />
        Notifications
        <span style={{ marginLeft: "8px", fontSize: "11px", color: "#555565", fontWeight: 400 }}>stored locally</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "14px", color: TEXT, fontWeight: 500 }}>Notify on sprint complete</div>
            <div style={{ fontSize: "12px", color: MUTED, marginTop: "2px" }}>Trigger when a sprint finishes successfully</div>
          </div>
          <Toggle checked={prefs.onComplete} onChange={(v) => update({ onComplete: v })} />
        </div>
        <div style={{ height: "1px", background: BORDER }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "14px", color: TEXT, fontWeight: 500 }}>Notify on sprint fail</div>
            <div style={{ fontSize: "12px", color: MUTED, marginTop: "2px" }}>Trigger when a sprint fails or errors</div>
          </div>
          <Toggle checked={prefs.onFail} onChange={(v) => update({ onFail: v })} />
        </div>
        <div style={{ height: "1px", background: BORDER }} />
        <div>
          <div style={label}>Notification Channel</div>
          <input
            style={inputStyle}
            placeholder="e.g. telegram, slack, webhook-url"
            value={prefs.channel}
            onChange={(e) => update({ channel: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data: config } = usePolling<MahConfig>("/api/config", 60000);

  return (
    <div style={{ padding: "32px", maxWidth: "760px", background: BG, minHeight: "100vh" }}>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 700, color: TEXT }}>Settings</h1>
        <div style={{ fontSize: "13px", color: MUTED }}>Configure agents, execution defaults, and notifications</div>
      </div>

      <GeneralSection config={config} />
      <AgentSection />
      <ExecutionSection config={config} />
      <NotificationsSection />
    </div>
  );
}
