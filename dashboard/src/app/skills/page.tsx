"use client";

import { useState } from "react";
import { Search, Wrench, Theater, Link2, Tag, ChevronDown, ChevronRight, AlertTriangle, Shield, Footprints } from "lucide-react";
import { usePolling } from "@/hooks/usePolling";

interface Skill {
  name: string;
  type: "capability" | "behavioral" | "workflow";
  description: string;
  agentTypes: string[];
  gotchas?: string[];
  constraints?: string[];
  persona?: string;
  steps?: { agent: string; action: string; input?: string; output?: string }[];
  tags?: string[];
  source?: { type: string; uri?: string; importedAt: string };
  dir: string;
}

const TYPE_CONFIG: Record<string, { icon: typeof Wrench; label: string; color: string }> = {
  capability: { icon: Wrench, label: "Capability", color: "#3b82f6" },
  behavioral: { icon: Theater, label: "Behavioral", color: "#a855f7" },
  workflow: { icon: Link2, label: "Workflow", color: "#10b981" },
};

function SkillCard({ skill }: { skill: Skill }) {
  const [expanded, setExpanded] = useState(false);
  const config = TYPE_CONFIG[skill.type] ?? TYPE_CONFIG.capability;
  const Icon = config.icon;

  return (
    <div
      style={{
        background: "#0f1116",
        borderTop: `1px solid ${expanded ? `${config.color}40` : "#1c1d26"}`,
        borderRight: `1px solid ${expanded ? `${config.color}40` : "#1c1d26"}`,
        borderBottom: `1px solid ${expanded ? `${config.color}40` : "#1c1d26"}`,
        borderLeft: `3px solid ${config.color}`,
        borderRadius: "12px",
        padding: "18px 20px",
        marginBottom: "10px",
        transition: "border-color 0.15s",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
            <Icon size={14} color={config.color} />
            <span style={{ fontSize: "15px", fontWeight: 600, color: "#e0e0e8" }}>{skill.name}</span>
            <span
              style={{
                fontSize: "10px",
                color: config.color,
                background: `${config.color}18`,
                border: `1px solid ${config.color}40`,
                borderRadius: "4px",
                padding: "1px 6px",
                fontWeight: 500,
              }}
            >
              {config.label}
            </span>
            <span style={{ fontSize: "10px", color: "#555565", fontStyle: "italic" }}>
              {skill.dir}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "13px", color: "#9ca3af", lineHeight: 1.5 }}>
            {skill.description}
          </p>
          {/* Tags */}
          {skill.tags && skill.tags.length > 0 && (
            <div style={{ display: "flex", gap: "4px", marginTop: "8px", flexWrap: "wrap" }}>
              {skill.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: "10px",
                    color: "#6b7280",
                    background: "rgba(107,114,128,0.1)",
                    border: "1px solid rgba(107,114,128,0.2)",
                    borderRadius: "4px",
                    padding: "1px 6px",
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ color: "#555565", padding: "2px", flexShrink: 0 }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ marginTop: "16px", borderTop: "1px solid #1c1d26", paddingTop: "14px" }}>
          {/* Agent types */}
          <div style={{ marginBottom: "12px" }}>
            <div style={{ fontSize: "11px", color: "#555565", fontWeight: 600, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Agent Types
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              {skill.agentTypes.map((at) => (
                <span key={at} style={{ fontSize: "12px", color: "#e0e0e8", background: "#1c1d26", borderRadius: "4px", padding: "2px 8px" }}>
                  {at}
                </span>
              ))}
            </div>
          </div>

          {/* Persona (behavioral) */}
          {skill.persona && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "11px", color: "#555565", fontWeight: 600, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Persona
              </div>
              <div style={{
                fontSize: "13px", color: "#9ca3af", lineHeight: 1.6, whiteSpace: "pre-wrap",
                background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.15)",
                borderRadius: "8px", padding: "10px 14px",
              }}>
                {skill.persona}
              </div>
            </div>
          )}

          {/* Workflow steps */}
          {skill.steps && skill.steps.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "11px", color: "#555565", fontWeight: 600, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                <Footprints size={12} style={{ display: "inline", marginRight: "4px", verticalAlign: "middle" }} />
                Workflow Steps
              </div>
              {skill.steps.map((step, i) => (
                <div key={i} style={{
                  display: "flex", gap: "10px", alignItems: "flex-start",
                  padding: "8px 12px", background: i % 2 === 0 ? "rgba(16,185,129,0.05)" : "transparent",
                  borderRadius: "6px", marginBottom: "2px",
                }}>
                  <span style={{ fontSize: "11px", color: "#10b981", fontWeight: 700, minWidth: "18px" }}>{i + 1}.</span>
                  <div>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#e0e0e8" }}>[{step.agent}]</span>{" "}
                    <span style={{ fontSize: "12px", color: "#9ca3af" }}>{step.action}</span>
                    {step.input && <span style={{ fontSize: "11px", color: "#555565" }}> (input: {step.input})</span>}
                    {step.output && <span style={{ fontSize: "11px", color: "#10b981" }}> → {step.output}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Gotchas */}
          {skill.gotchas && skill.gotchas.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "11px", color: "#eab308", fontWeight: 600, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                <AlertTriangle size={12} style={{ display: "inline", marginRight: "4px", verticalAlign: "middle" }} />
                Gotchas ({skill.gotchas.length})
              </div>
              <ul style={{ margin: 0, paddingLeft: "16px" }}>
                {skill.gotchas.map((g, i) => (
                  <li key={i} style={{ fontSize: "12px", color: "#9ca3af", lineHeight: 1.6, marginBottom: "4px" }}>{g}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Constraints */}
          {skill.constraints && skill.constraints.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "11px", color: "#3b82f6", fontWeight: 600, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                <Shield size={12} style={{ display: "inline", marginRight: "4px", verticalAlign: "middle" }} />
                Constraints ({skill.constraints.length})
              </div>
              <ul style={{ margin: 0, paddingLeft: "16px" }}>
                {skill.constraints.map((c, i) => (
                  <li key={i} style={{ fontSize: "12px", color: "#9ca3af", lineHeight: 1.6, marginBottom: "4px" }}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Source */}
          {skill.source && (
            <div style={{ fontSize: "11px", color: "#555565", marginTop: "8px" }}>
              Imported: {skill.source.type}{skill.source.uri ? ` from ${skill.source.uri}` : ""} — {new Date(skill.source.importedAt).toLocaleDateString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SkillsPage() {
  const { data: skills, loading } = usePolling<Skill[]>("/api/skills", 30000);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filtered = (skills ?? []).filter((s) => {
    if (typeFilter !== "all" && s.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const counts = {
    all: (skills ?? []).length,
    capability: (skills ?? []).filter((s) => s.type === "capability").length,
    behavioral: (skills ?? []).filter((s) => s.type === "behavioral").length,
    workflow: (skills ?? []).filter((s) => s.type === "workflow").length,
  };

  return (
    <div style={{ padding: "32px", maxWidth: "900px" }}>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: "26px", fontWeight: 700, color: "#e0e0e8" }}>
          Agent Skills
        </h1>
        <p style={{ margin: 0, fontSize: "14px", color: "#9ca3af" }}>
          Capability, behavioral, and workflow skills that shape how agents operate per sprint.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
          <Search size={14} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#555565" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills..."
            style={{
              width: "100%",
              background: "#0f1116",
              border: "1px solid #1c1d26",
              borderRadius: "8px",
              padding: "9px 12px 9px 34px",
              fontSize: "13px",
              color: "#e0e0e8",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "4px" }}>
          {(["all", "capability", "behavioral", "workflow"] as const).map((t) => {
            const active = typeFilter === t;
            const config = t === "all" ? { color: "#9ca3af" } : TYPE_CONFIG[t];
            const color = config?.color ?? "#9ca3af";
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                style={{
                  padding: "6px 12px",
                  background: active ? `${color}18` : "transparent",
                  border: `1px solid ${active ? `${color}40` : "#1c1d26"}`,
                  borderRadius: "6px",
                  color: active ? color : "#555565",
                  fontSize: "12px",
                  fontWeight: active ? 600 : 400,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {t} ({counts[t]})
              </button>
            );
          })}
        </div>
      </div>

      {/* Skill list */}
      {loading && !skills ? (
        <div style={{ color: "#555565", fontSize: "14px", padding: "40px 0", textAlign: "center" }}>
          Loading skills...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "#555565", fontSize: "14px", padding: "40px 0", textAlign: "center" }}>
          {search ? "No skills match your search." : "No skills found. Run `mah skill create` to add one."}
        </div>
      ) : (
        filtered.map((skill) => <SkillCard key={skill.name} skill={skill} />)
      )}
    </div>
  );
}
