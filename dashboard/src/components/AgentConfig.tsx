"use client";

import { useState } from "react";
import { X, Plus, ChevronDown, ChevronUp } from "lucide-react";
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
    platform: "openclaw" as const,
    skills: "",
    contextFolders: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    "claude-code": "#7c3aed",
    codex: "#f59e0b",
  };

  return (
    <div
      style={{
        marginTop: "24px",
        background: "#141420",
        border: "1px solid #2a2a3a",
        borderRadius: "12px",
        padding: "24px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "#e0e0e8" }}>Agent Config</h2>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            padding: "8px 16px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(124, 58, 237, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <Plus size={16} />
          Add Agent
        </button>
      </div>

      {/* Agent Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "16px",
        }}
      >
        {agents.map((agent) => (
          <div key={agent.id}>
            {/* Agent Card */}
            <div
              onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
              style={{
                background: "#0d0d18",
                border: `1px solid ${expandedAgent === agent.id ? agent.color : "#2a2a3a"}`,
                borderRadius: "12px",
                padding: "16px",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (expandedAgent !== agent.id) {
                  e.currentTarget.style.borderColor = agent.color + "60";
                }
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = `0 4px 16px ${agent.color}20`;
              }}
              onMouseLeave={(e) => {
                if (expandedAgent !== agent.id) {
                  e.currentTarget.style.borderColor = "#2a2a3a";
                }
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              {/* Icon & Name */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "12px" }}>
                <div
                  style={{
                    fontSize: "32px",
                    lineHeight: 1,
                    filter: "drop-shadow(0 0 8px " + agent.color + "40)",
                  }}
                >
                  {agent.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "16px", fontWeight: 600, color: "#e0e0e8", marginBottom: "2px" }}>
                    {agent.name}
                  </div>
                  <div style={{ fontSize: "12px", color: "#888898", lineHeight: 1.4 }}>{agent.role}</div>
                </div>
                <div style={{ color: agent.color, transition: "transform 0.2s ease" }}>
                  {expandedAgent === agent.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </div>

              {/* Platform Badge */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  background: platformColors[agent.platform] + "20",
                  border: `1px solid ${platformColors[agent.platform]}40`,
                  borderRadius: "6px",
                  padding: "4px 8px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: platformColors[agent.platform],
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: "12px",
                }}
              >
                {agent.platform}
              </div>

              {/* Skills Pills */}
              {agent.skills.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                  {agent.skills.slice(0, 3).map((skill, i) => (
                    <div
                      key={i}
                      style={{
                        background: "#1a1a2a",
                        border: "1px solid #2a2a3a",
                        borderRadius: "4px",
                        padding: "3px 8px",
                        fontSize: "10px",
                        color: "#888898",
                      }}
                    >
                      {skill}
                    </div>
                  ))}
                  {agent.skills.length > 3 && (
                    <div
                      style={{
                        background: "#1a1a2a",
                        border: "1px solid #2a2a3a",
                        borderRadius: "4px",
                        padding: "3px 8px",
                        fontSize: "10px",
                        color: "#888898",
                      }}
                    >
                      +{agent.skills.length - 3}
                    </div>
                  )}
                </div>
              )}

              {/* Context Folders & Status */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: "11px", color: "#666676" }}>
                  {agent.contextFolders.length > 0
                    ? `${agent.contextFolders.length} context folder${agent.contextFolders.length > 1 ? "s" : ""}`
                    : "No context folders"}
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {agent.isEvaluator && (
                    <div
                      style={{
                        background: "#a855f720",
                        border: "1px solid #a855f740",
                        borderRadius: "4px",
                        padding: "2px 6px",
                        fontSize: "9px",
                        fontWeight: 600,
                        color: "#a855f7",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Evaluator
                    </div>
                  )}
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#10b981",
                      boxShadow: "0 0 8px #10b98160",
                    }}
                    title="Active"
                  />
                </div>
              </div>
            </div>

            {/* Expanded Detail Panel */}
            {expandedAgent === agent.id && (
              <div
                style={{
                  background: "#0a0a12",
                  border: `1px solid ${agent.color}40`,
                  borderTop: "none",
                  borderRadius: "0 0 12px 12px",
                  padding: "16px",
                  marginTop: "-12px",
                  animation: "expandDown 0.2s ease",
                }}
              >
                <div style={{ fontSize: "12px", color: "#888898", marginBottom: "12px", lineHeight: 1.6 }}>
                  {agent.description}
                </div>

                {/* Skills List */}
                {agent.skills.length > 0 && (
                  <div style={{ marginBottom: "12px" }}>
                    <div
                      style={{
                        fontSize: "10px",
                        color: "#666676",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: "6px",
                        fontWeight: 600,
                      }}
                    >
                      Skills
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {agent.skills.map((skill, i) => (
                        <div
                          key={i}
                          style={{
                            background: "#1a1a2a",
                            border: "1px solid #2a2a3a",
                            borderRadius: "4px",
                            padding: "4px 10px",
                            fontSize: "11px",
                            color: "#e0e0e8",
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
                  <div style={{ marginBottom: "12px" }}>
                    <div
                      style={{
                        fontSize: "10px",
                        color: "#666676",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: "6px",
                        fontWeight: 600,
                      }}
                    >
                      Context Folders
                    </div>
                    {agent.contextFolders.map((folder, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: "11px",
                          color: "#888898",
                          marginBottom: "4px",
                          fontFamily: "monospace",
                        }}
                      >
                        {folder.path}
                      </div>
                    ))}
                  </div>
                )}

                {/* Workspace */}
                <div style={{ marginBottom: "8px" }}>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#666676",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: "6px",
                      fontWeight: 600,
                    }}
                  >
                    Workspace
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#888898",
                      fontFamily: "monospace",
                      wordBreak: "break-all",
                    }}
                  >
                    {agent.workspace}
                  </div>
                </div>

                {/* Platform Info */}
                <div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#666676",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: "6px",
                      fontWeight: 600,
                    }}
                  >
                    Platform
                  </div>
                  <div style={{ fontSize: "11px", color: agent.color, fontWeight: 600 }}>{agent.platform}</div>
                </div>
              </div>
            )}
          </div>
        ))}
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
              background: "rgba(0, 0, 0, 0.7)",
              backdropFilter: "blur(4px)",
              zIndex: 1000,
              animation: "fadeIn 0.2s ease",
            }}
          />
          {/* Modal */}
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "#141420",
              border: "1px solid #7c3aed",
              borderRadius: "16px",
              padding: "24px",
              width: "90%",
              maxWidth: "500px",
              zIndex: 1001,
              boxShadow: "0 20px 60px rgba(124, 58, 237, 0.3)",
              animation: "slideUp 0.25s ease",
            }}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: "#e0e0e8" }}>Add New Agent</h3>
              <button
                onClick={() => !isSubmitting && setShowAddModal(false)}
                disabled={isSubmitting}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#888898",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  padding: "4px",
                  display: "flex",
                  transition: "color 0.15s ease",
                }}
                onMouseEnter={(e) => !isSubmitting && (e.currentTarget.style.color = "#e0e0e8")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#888898")}
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddAgent}>
              {/* Name */}
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#888898",
                    marginBottom: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
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
                    background: "#0d0d18",
                    border: "1px solid #2a2a3a",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    fontSize: "14px",
                    color: "#e0e0e8",
                    outline: "none",
                    transition: "border-color 0.15s ease",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#7c3aed")}
                  onBlur={(e) => (e.target.style.borderColor = "#2a2a3a")}
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#888898",
                    marginBottom: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
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
                    background: "#0d0d18",
                    border: "1px solid #2a2a3a",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    fontSize: "14px",
                    color: "#e0e0e8",
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                    transition: "border-color 0.15s ease",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#7c3aed")}
                  onBlur={(e) => (e.target.style.borderColor = "#2a2a3a")}
                />
              </div>

              {/* Platform */}
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#888898",
                    marginBottom: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
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
                    background: "#0d0d18",
                    border: "1px solid #2a2a3a",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    fontSize: "14px",
                    color: "#e0e0e8",
                    outline: "none",
                    cursor: "pointer",
                    transition: "border-color 0.15s ease",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#7c3aed")}
                  onBlur={(e) => (e.target.style.borderColor = "#2a2a3a")}
                >
                  <option value="openclaw">OpenClaw</option>
                  <option value="claude-code">Claude Code</option>
                  <option value="codex">Codex</option>
                </select>
              </div>

              {/* Skills (Optional) */}
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#888898",
                    marginBottom: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Skills (Optional)
                </label>
                <input
                  type="text"
                  value={addForm.skills}
                  onChange={(e) => setAddForm({ ...addForm, skills: e.target.value })}
                  placeholder="Comma-separated, e.g., UI design, Testing"
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    background: "#0d0d18",
                    border: "1px solid #2a2a3a",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    fontSize: "14px",
                    color: "#e0e0e8",
                    outline: "none",
                    transition: "border-color 0.15s ease",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#7c3aed")}
                  onBlur={(e) => (e.target.style.borderColor = "#2a2a3a")}
                />
              </div>

              {/* Context Folders (Optional) */}
              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#888898",
                    marginBottom: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Context Folders (Optional)
                </label>
                <input
                  type="text"
                  value={addForm.contextFolders}
                  onChange={(e) => setAddForm({ ...addForm, contextFolders: e.target.value })}
                  placeholder="Comma-separated paths"
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    background: "#0d0d18",
                    border: "1px solid #2a2a3a",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    fontSize: "14px",
                    color: "#e0e0e8",
                    outline: "none",
                    transition: "border-color 0.15s ease",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#7c3aed")}
                  onBlur={(e) => (e.target.style.borderColor = "#2a2a3a")}
                />
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={isSubmitting}
                  style={{
                    flex: 1,
                    background: "#1a1a2a",
                    color: "#888898",
                    border: "1px solid #2a2a3a",
                    borderRadius: "8px",
                    padding: "10px 16px",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) =>
                    !isSubmitting && ((e.currentTarget.style.background = "#252535"), (e.currentTarget.style.color = "#e0e0e8"))
                  }
                  onMouseLeave={(e) => ((e.currentTarget.style.background = "#1a1a2a"), (e.currentTarget.style.color = "#888898"))}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    flex: 1,
                    background: isSubmitting ? "#555565" : "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 16px",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => !isSubmitting && (e.currentTarget.style.transform = "translateY(-1px)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
                >
                  {isSubmitting ? "Creating Sprint..." : "Create Agent"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Animations */}
      <style jsx>{`
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
            transform: translate(-50%, -45%);
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
          }
          to {
            opacity: 1;
            max-height: 1000px;
          }
        }
      `}</style>
    </div>
  );
}
