"use client";

export interface NotificationSettings {
  channel: "telegram" | "slack" | "email" | "none";
  onStart: boolean;
  onQaFailure: boolean;
  onCompletion: boolean;
  onEscalation: boolean;
  responseTimeoutMinutes: number;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  channel: "telegram",
  onStart: false,
  onQaFailure: true,
  onCompletion: true,
  onEscalation: true,
  responseTimeoutMinutes: 30,
};

interface NotificationConfigProps {
  value: NotificationSettings;
  onChange: (value: NotificationSettings) => void;
  compact?: boolean;
}

const CHANNELS = [
  { value: "telegram" as const, label: "Telegram", emoji: "✈️" },
  { value: "slack" as const, label: "Slack", emoji: "💬" },
  { value: "email" as const, label: "Email", emoji: "📧" },
  { value: "none" as const, label: "None", emoji: "🔕" },
];

const EVENT_OPTIONS: { key: keyof Pick<NotificationSettings, "onStart" | "onQaFailure" | "onCompletion" | "onEscalation">; label: string }[] = [
  { key: "onStart", label: "On start" },
  { key: "onQaFailure", label: "On QA failure" },
  { key: "onCompletion", label: "On completion" },
  { key: "onEscalation", label: "On escalation" },
];

export default function NotificationConfig({
  value,
  onChange,
  compact = false,
}: NotificationConfigProps) {
  const update = (patch: Partial<NotificationSettings>) => onChange({ ...value, ...patch });

  return (
    <div>
      {/* Channel selector */}
      <div style={{ marginBottom: compact ? "10px" : "14px" }}>
        <label style={{ display: "block", fontSize: "12px", color: "#9ca3af", marginBottom: "6px" }}>
          Notification channel
        </label>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {CHANNELS.map((ch) => {
            const selected = value.channel === ch.value;
            return (
              <button
                key={ch.value}
                onClick={() => update({ channel: ch.value })}
                style={{
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: `1px solid ${selected ? "#fb923c" : "#1c1d26"}`,
                  background: selected ? "rgba(20,184,166,0.15)" : "transparent",
                  color: selected ? "#fb923c" : "#9ca3af",
                  fontSize: "12px",
                  fontWeight: selected ? 600 : 400,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  transition: "all 0.15s",
                }}
              >
                <span>{ch.emoji}</span>
                {ch.label}
              </button>
            );
          })}
        </div>
      </div>

      {value.channel !== "none" && (
        <>
          {/* Event checkboxes */}
          <div style={{ marginBottom: compact ? "10px" : "14px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "#9ca3af", marginBottom: "6px" }}>
              Notify when
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              {EVENT_OPTIONS.map(({ key, label }) => {
                const checked = value[key];
                return (
                  <label
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "7px 10px",
                      background: checked ? "rgba(20,184,166,0.08)" : "transparent",
                      border: `1px solid ${checked ? "rgba(20,184,166,0.25)" : "#1c1d26"}`,
                      borderRadius: "6px",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => update({ [key]: e.target.checked })}
                      style={{ accentColor: "#fb923c", flexShrink: 0 }}
                    />
                    <span style={{ fontSize: "12px", color: checked ? "#e0e0e8" : "#9ca3af" }}>
                      {label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Response timeout */}
          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#9ca3af", marginBottom: "6px" }}>
              Response timeout (minutes)
            </label>
            <input
              type="number"
              min={5}
              max={1440}
              value={value.responseTimeoutMinutes}
              onChange={(e) =>
                update({ responseTimeoutMinutes: parseInt(e.target.value) || 30 })
              }
              style={{
                width: "120px",
                background: "#0d0d18",
                border: "1px solid #1c1d26",
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "13px",
                color: "#e0e0e8",
                outline: "none",
              }}
            />
            <span style={{ fontSize: "11px", color: "#555565", marginLeft: "8px" }}>
              {value.responseTimeoutMinutes >= 60
                ? `${Math.floor(value.responseTimeoutMinutes / 60)}h ${value.responseTimeoutMinutes % 60 > 0 ? `${value.responseTimeoutMinutes % 60}m` : ""}`.trim()
                : `${value.responseTimeoutMinutes} min`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
