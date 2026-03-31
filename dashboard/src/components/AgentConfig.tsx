"use client";

import { useState } from "react";
import { X, Plus, ChevronRight, Sparkles, Zap } from "lucide-react";
import type { AgentDefinition } from "@/lib/agents";

interface AgentConfigProps {
  agents: AgentDefinition[];
  onAddAgent: (data: { name: string; description: string; platform: string; skills: string; contextFolders: string }) => Promise<void>;
}

export default function AgentConfig({ agents, onAddAgent }: AgentConfigProps) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    description: "",
    platform: "openclaw",
    skills: "",
    contextFolders: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onAddAgent({
        name: addForm.name,
        description: addForm.description,
        platform: addForm.platform,
        skills: addForm.skills,
        contextFolders: addForm.contextFolders,
      });
      setShowAddModal(false);
      setAddForm({ name: "", description: "", platform: "openclaw", skills: "", contextFolders: "" });
    } catch (err) {
      console.error("Failed to add agent:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const platformColors: Record<string, string> = {
    openclaw: "#10b981",
    "claude-code": "#fb923c",
    codex: "#eab308",
  };

  return (
    <div
      style={{
        marginTop: "32px",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "16px",
        padding: "28px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle gradient accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: "linear-gradient(90deg, transparent, #fb923c, #10b981, transparent)",
          opacity: 0.7,
        }}
      />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", gap: "16px" }}>
        <div>
          <h2 style={{ margin: "0 0 6px 0", fontSize: "17px", fontWeight: 700, color: "#e0e0e8", letterSpacing: "-0.02em" }}>
            Agent Config
          </h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#666676", lineHeight: 1.5 }}>
            {agents.length} active agent{agents.length !== 1 ? "s" : ""} in the system
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            background: "linear-gradient(135deg, #fb923c 0%, #f97316 50%, #10b981 100%)",
            color: "#fff",
            border: "none",
            borderRadius: "10px",
            padding: "10px 18px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: "0 2px 8px rgba(20, 184, 166, 0.25)",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 8px 20px rgba(20, 184, 166, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(20, 184, 166, 0.25)";
          }}
        >
          <Plus size={16} strokeWidth={2.5} />
          Add Agent
        </button>
      </div>

      {/* Agent Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: "18px",
        }}
      >
        {agents.map((agent) => {
          const isExpanded = expandedAgent === agent.id;
          const isHovered = hoveredCard === agent.id;

          return (
            <div key={agent.id}>
              {/* Agent Card */}
              <div
                onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                onMouseEnter={() => setHoveredCard(agent.id)}
                onMouseLeave={() => setHoveredCard(null)}
                style={{
                  background: isExpanded ? "var(--bg)" : "var(--card-elevated)",
                  border: `1px solid ${isExpanded ? agent.color : "var(--border)"}`,
                  borderRadius: "14px",
                  padding: "20px",
                  cursor: "pointer",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  position: "relative",
                  overflow: "hidden",
                  transform: isHovered || isExpanded ? "translateY(-3px)" : "translateY(0)",
                  boxShadow: isHovered || isExpanded
                    ? `0 8px 24px ${agent.color}30, 0 0 0 1px ${agent.color}20`
                    : "0 2px 8px rgba(0,0,0,0.1)",
                }}
              >
                {/* Colored accent bar */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "3px",
                    background: `linear-gradient(90deg, transparent, ${agent.color}, transparent)`,
                    opacity: isExpanded ? 1 : isHovered ? 0.7 : 0,
                    transition: "opacity 0.3s ease",
                  }}
                />

                {/* Icon & Name */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "16px" }}>
                  <div
                    style={{
                      fontSize: "36px",
                      lineHeight: 1,
                      filter: `drop-shadow(0 2px 12px ${agent.color}${isHovered ? "60" : "30"})`,
                      transition: "filter 0.3s ease",
                    }}
                  >
                    {agent.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "17px",
                      fontWeight: 700,
                      color: "#e0e0e8",
                      marginBottom: "4px",
                      letterSpacing: "-0.01em",
                    }}>
                      {agent.name}
                    </div>
                    <div style={{ fontSize: "13px", color: "#9ca3af", lineHeight: 1.4 }}>
                      {agent.role}
                    </div>
                  </div>
                  <ChevronRight
                    size={20}
                    style={{
                      color: agent.color,
                      transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                      opacity: isHovered || isExpanded ? 1 : 0.4,
                    }}
                  />
                </div>

              {/* Metadata row */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
                {/* Platform Badge */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    background: `${platformColors[agent.platform]}15`,
                    border: `1px solid ${platformColors[agent.platform]}35`,
                    borderRadius: "7px",
                    padding: "5px 10px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: platformColors[agent.platform],
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  <div
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: platformColors[agent.platform],
                    }}
                  />
                  {agent.platform}
                </div>

                {/* Evaluator Badge */}
                {agent.isEvaluator && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      background: "#fb923c15",
                      border: "1px solid #fb923c35",
                      borderRadius: "7px",
                      padding: "5px 10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#fb923c",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    <Sparkles size={11} strokeWidth={2.5} />
                    QA
                  </div>
                )}

                {/* Active Status */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    background: "#10b98115",
                    border: "1px solid #10b98135",
                    borderRadius: "7px",
                    padding: "5px 10px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#10b981",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  <div
                    className="pulse-dot"
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#10b981",
                      boxShadow: "0 0 10px #10b98180",
                    }}
                  />
                  Active
                </div>
              </div>

              {/* Skills Pills */}
              {agent.skills.length > 0 && (
                <div style={{ marginBottom: "14px" }}>
                  <div style={{
                    fontSize: "10px",
                    color: "#555565",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 700,
                    marginBottom: "8px",
                  }}>
                    Skills
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {agent.skills.slice(0, 2).map((skill, i) => (
                      <div
                        key={i}
                        style={{
                          background: "#1a1a2a",
                          border: "1px solid #1c1d26",
                          borderRadius: "6px",
                          padding: "5px 10px",
                          fontSize: "11px",
                          color: "#b8b8c8",
                          fontWeight: 500,
                        }}
                      >
                        {skill}
                      </div>
                    ))}
                    {agent.skills.length > 2 && (
                      <div
                        style={{
                          background: `${agent.color}15`,
                          border: `1px solid ${agent.color}30`,
                          borderRadius: "6px",
                          padding: "5px 10px",
                          fontSize: "11px",
                          color: agent.color,
                          fontWeight: 600,
                        }}
                      >
                        +{agent.skills.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Context Folders Indicator */}
              <div style={{
                fontSize: "12px",
                color: "#666676",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}>
                <div style={{
                  width: "4px",
                  height: "4px",
                  borderRadius: "50%",
                  background: agent.contextFolders.length > 0 ? agent.color : "#3a3a4a",
                }} />
                {agent.contextFolders.length > 0
                  ? `${agent.contextFolders.length} context folder${agent.contextFolders.length > 1 ? "s" : ""}`
                  : "No context folders"}
              </div>
            </div>

            {/* Expanded Detail Panel */}
            {isExpanded && (
              <div
                style={{
                  background: "var(--bg)",
                  border: `1px solid ${agent.color}50`,
                  borderTop: "none",
                  borderRadius: "0 0 14px 14px",
                  padding: "20px",
                  marginTop: "-14px",
                  animation: "expandDown 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                {/* Description */}
                <div style={{
                  fontSize: "13px",
                  color: "#a8a8b8",
                  marginBottom: "20px",
                  lineHeight: 1.7,
                  paddingLeft: "12px",
                  borderLeft: `3px solid ${agent.color}40`,
                }}>
                  {agent.description}
                </div>

                {/* Details Grid */}
                <div style={{ display: "grid", gap: "16px" }}>
                  {/* Skills List */}
                  {agent.skills.length > 0 && (
                    <div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "#555565",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          marginBottom: "8px",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <Zap size={11} color={agent.color} strokeWidth={2.5} />
                        Skills & Capabilities
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                        {agent.skills.map((skill, i) => (
                          <div
                            key={i}
                            style={{
                              background: "#0f1116",
                              border: "1px solid #1c1d26",
                              borderRadius: "7px",
                              padding: "6px 12px",
                              fontSize: "12px",
                              color: "#d0d0d8",
                              fontWeight: 500,
                            }}
                          >
                            {skill}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Context Folders */}
                  {agent.contextFolders.length > 0 && (
                    <div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "#555565",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          marginBottom: "8px",
                          fontWeight: 700,
                        }}
                      >
                        Context Folders
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {agent.contextFolders.map((folder, i) => (
                          <div
                            key={i}
                            style={{
                              fontSize: "11px",
                              color: "#9ca3af",
                              fontFamily: "ui-monospace, monospace",
                              background: "#0f1116",
                              padding: "8px 12px",
                              borderRadius: "6px",
                              border: "1px solid #1a1a2a",
                            }}
                          >
                            {folder.path}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Workspace */}
                  <div>
                    <div
                      style={{
                        fontSize: "10px",
                        color: "#555565",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: "8px",
                        fontWeight: 700,
                      }}
                    >
                      Workspace Path
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#9ca3af",
                        fontFamily: "ui-monospace, monospace",
                        background: "#0f1116",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid #1a1a2a",
                        wordBreak: "break-all",
                      }}
                    >
                      {agent.workspace}
                    </div>
                  </div>

                  {/* Platform Details */}
                  <div>
                    <div
                      style={{
                        fontSize: "10px",
                        color: "#555565",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: "8px",
                        fontWeight: 700,
                      }}
                    >
                      Execution Platform
                    </div>
                    <div style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      background: `${agent.color}10`,
                      border: `1px solid ${agent.color}30`,
                      borderRadius: "8px",
                      padding: "8px 14px",
                      fontSize: "12px",
                      color: agent.color,
                      fontWeight: 600,
                    }}>
                      <div style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: agent.color,
                        boxShadow: `0 0 10px ${agent.color}60`,
                      }} />
                      {agent.platform}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
        })}
      </div>

      {/* Add Agent Modal */}
      {showAddModal && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => !isSubmitting && setShowAddModal(false)}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(8px)",
              zIndex: 1000,
              animation: "fadeIn 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
          {/* Modal */}
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "linear-gradient(135deg, var(--card) 0%, var(--card-elevated) 100%)",
              border: "1px solid #fb923c",
              borderRadius: "20px",
              padding: "28px",
              width: "90%",
              maxWidth: "520px",
              zIndex: 1001,
              boxShadow: "0 24px 80px rgba(20, 184, 166, 0.4), 0 0 0 1px rgba(20, 184, 166, 0.2)",
              animation: "slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
              <div>
                <h3 style={{ margin: "0 0 6px 0", fontSize: "20px", fontWeight: 700, color: "#e0e0e8", letterSpacing: "-0.02em" }}>
                  Add New Agent
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#666676", lineHeight: 1.5 }}>
                  Configure a new agent to join your team
                </p>
              </div>
              <button
                onClick={() => !isSubmitting && setShowAddModal(false)}
                disabled={isSubmitting}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid #1c1d26",
                  borderRadius: "8px",
                  color: "#9ca3af",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  padding: "8px",
                  display: "flex",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                    e.currentTarget.style.borderColor = "#fb923c";
                    e.currentTarget.style.color = "#e0e0e8";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.borderColor = "#1c1d26";
                  e.currentTarget.style.color = "#9ca3af";
                }}
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddAgent}>
              {/* Name */}
              <div style={{ marginBottom: "18px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#9ca3af",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Agent Name *
                </label>
                <input
                  type="text"
                  required
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="e.g., Alex"
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    padding: "12px 14px",
                    fontSize: "14px",
                    color: "#e0e0e8",
                    outline: "none",
                    transition: "all 0.2s ease",
                    fontWeight: 500,
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#fb923c";
                    e.target.style.boxShadow = "0 0 0 3px rgba(20, 184, 166, 0.12)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--border)";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: "18px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#9ca3af",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Role/Description *
                </label>
                <textarea
                  required
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  placeholder="What does this agent do?"
                  rows={3}
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    padding: "12px 14px",
                    fontSize: "14px",
                    color: "#e0e0e8",
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                    transition: "all 0.2s ease",
                    fontWeight: 500,
                    lineHeight: 1.6,
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#fb923c";
                    e.target.style.boxShadow = "0 0 0 3px rgba(20, 184, 166, 0.12)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--border)";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>

              {/* Platform */}
              <div style={{ marginBottom: "18px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#9ca3af",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Platform *
                </label>
                <select
                  value={addForm.platform}
                  onChange={(e) => setAddForm({ ...addForm, platform: e.target.value })}
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    padding: "12px 14px",
                    fontSize: "14px",
                    color: "#e0e0e8",
                    outline: "none",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    fontWeight: 500,
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#fb923c";
                    e.target.style.boxShadow = "0 0 0 3px rgba(20, 184, 166, 0.12)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--border)";
                    e.target.style.boxShadow = "none";
                  }}
                >
                  <option value="openclaw">OpenClaw</option>
                  <option value="claude-code">Claude Code</option>
                  <option value="codex">Codex</option>
                </select>
              </div>

              {/* Skills (Optional) */}
              <div style={{ marginBottom: "18px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#9ca3af",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Skills <span style={{ color: "#555565", fontWeight: 500 }}>(Optional)</span>
                </label>
                <input
                  type="text"
                  value={addForm.skills}
                  onChange={(e) => setAddForm({ ...addForm, skills: e.target.value })}
                  placeholder="Comma-separated, e.g., UI design, Testing"
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    padding: "12px 14px",
                    fontSize: "14px",
                    color: "#e0e0e8",
                    outline: "none",
                    transition: "all 0.2s ease",
                    fontWeight: 500,
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#fb923c";
                    e.target.style.boxShadow = "0 0 0 3px rgba(20, 184, 166, 0.12)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--border)";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>

              {/* Context Folders (Optional) */}
              <div style={{ marginBottom: "24px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#9ca3af",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Context Folders <span style={{ color: "#555565", fontWeight: 500 }}>(Optional)</span>
                </label>
                <input
                  type="text"
                  value={addForm.contextFolders}
                  onChange={(e) => setAddForm({ ...addForm, contextFolders: e.target.value })}
                  placeholder="Comma-separated paths"
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    padding: "12px 14px",
                    fontSize: "14px",
                    color: "#e0e0e8",
                    outline: "none",
                    transition: "all 0.2s ease",
                    fontWeight: 500,
                    fontFamily: "ui-monospace, monospace",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#fb923c";
                    e.target.style.boxShadow = "0 0 0 3px rgba(20, 184, 166, 0.12)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--border)";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={isSubmitting}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.05)",
                    color: "#9ca3af",
                    border: "1px solid #1c1d26",
                    borderRadius: "10px",
                    padding: "12px 18px",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                      e.currentTarget.style.borderColor = "#3a3a4a";
                      e.currentTarget.style.color = "#e0e0e8";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                    e.currentTarget.style.borderColor = "#1c1d26";
                    e.currentTarget.style.color = "#9ca3af";
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    flex: 1,
                    background: isSubmitting ? "#555565" : "linear-gradient(135deg, #fb923c 0%, #f97316 50%, #10b981 100%)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "10px",
                    padding: "12px 18px",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    boxShadow: isSubmitting ? "none" : "0 2px 12px rgba(20, 184, 166, 0.3)",
                    opacity: isSubmitting ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "0 6px 20px rgba(20, 184, 166, 0.5)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 2px 12px rgba(20, 184, 166, 0.3)";
                  }}
                >
                  {isSubmitting ? "Creating Sprint..." : "Create Agent"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Animations & Global Styles */}
      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translate(-50%, -48%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }

        @keyframes expandDown {
          from {
            opacity: 0;
            max-height: 0;
            padding-top: 0;
            padding-bottom: 0;
          }
          to {
            opacity: 1;
            max-height: 2000px;
            padding-top: 20px;
            padding-bottom: 20px;
          }
        }

        @keyframes pulse-dot {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.1);
          }
        }

        .pulse-dot {
          animation: pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        /* Smooth scrolling for the modal */
        .modal-content {
          scrollbar-width: thin;
          scrollbar-color: #1c1d26 #0d0d18;
        }

        .modal-content::-webkit-scrollbar {
          width: 8px;
        }

        .modal-content::-webkit-scrollbar-track {
          background: #0d0d18;
          border-radius: 4px;
        }

        .modal-content::-webkit-scrollbar-thumb {
          background: #1c1d26;
          border-radius: 4px;
        }

        .modal-content::-webkit-scrollbar-thumb:hover {
          background: #3a3a4a;
        }
      `}</style>
    </div>
  );
}
