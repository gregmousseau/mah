"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Wand2,
  Save,
  Clock,
  Rocket,
  Plus,
  X,
  ChevronUp,
  ChevronDown,
  Handshake,
  Loader2,
} from "lucide-react";
import { usePolling } from "@/hooks/usePolling";
import type { Project, SprintPlanItem } from "@/types/mah";
import { getGeneratorAgents, getAgentColor, getAgentIcon } from "@/lib/agents";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DraftSprint {
  // local draft id (not saved to disk yet)
  localId: string;
  name: string;
  task: string;
  sprintType: "code" | "frontend" | "research" | "content" | "fullstack";
  agent: { id: string; name: string; reason?: string };
  evaluator: { id: string; name: string };
  suggestedQaTier: "smoke" | "targeted" | "full";
  dependencies: string[];
  estimatedComplexity: "low" | "medium" | "high";
  // After negotiation:
  devBrief?: { repo: string; constraints: string[]; definitionOfDone: string[] };
  qaBrief?: { tier: string; testUrl: string; testFocus: string[]; passCriteria: string[]; knownLimitations: string[] };
  generatorBrief?: string;
  evaluatorBrief?: string;
  negotiated?: boolean;
  negotiating?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COMPLEXITY_COLORS: Record<string, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
};

const STORAGE_KEY = "mah-builder-state-v2";

// ─── Small helpers ────────────────────────────────────────────────────────────

function AgentBadge({ agentId, agentName, size = "sm" }: { agentId: string; agentName: string; size?: "sm" | "md" }) {
  const color = getAgentColor(agentId);
  const icon = getAgentIcon(agentId);
  const fontSize = size === "md" ? "12px" : "10px";
  const padding = size === "md" ? "3px 8px" : "2px 6px";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize,
        fontWeight: 600,
        color,
        background: `${color}18`,
        border: `1px solid ${color}40`,
        borderRadius: "4px",
        padding,
        whiteSpace: "nowrap",
      }}
    >
      <span>{icon}</span>
      {agentName}
    </span>
  );
}

function ComplexityBadge({ complexity }: { complexity: string }) {
  const color = COMPLEXITY_COLORS[complexity] || "#888898";
  return (
    <span style={{
      fontSize: "10px",
      color,
      background: `${color}18`,
      border: `1px solid ${color}40`,
      borderRadius: "4px",
      padding: "2px 6px",
      fontWeight: 500,
      textTransform: "capitalize" as const,
    }}>
      {complexity}
    </span>
  );
}

function SprintCard({
  sprint,
  index,
  total,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
  onNegotiate,
  projectRepo,
}: {
  sprint: DraftSprint;
  index: number;
  total: number;
  onEdit: (updates: Partial<DraftSprint>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onNegotiate: () => void;
  projectRepo: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editTask, setEditTask] = useState(sprint.task);
  const [editAgent, setEditAgent] = useState(sprint.agent.id);

  const agentColor = getAgentColor(sprint.agent.id);

  return (
    <div
      style={{
        background: "#141420",
        border: `1px solid ${sprint.negotiated ? "rgba(34,197,94,0.3)" : "#2a2a3a"}`,
        borderRadius: "12px",
        padding: "18px 20px",
        marginBottom: "12px",
        borderLeft: `3px solid ${agentColor}`,
        position: "relative",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "#555565", fontFamily: "monospace" }}>
              {index + 1}/{total}
            </span>
            {!editing ? (
              <span
                style={{ fontSize: "14px", fontWeight: 600, color: "#e0e0e8", cursor: "pointer" }}
                onClick={() => setEditing(true)}
              >
                {sprint.name}
              </span>
            ) : (
              <input
                value={sprint.name}
                onChange={(e) => onEdit({ name: e.target.value })}
                style={{
                  background: "#0d0d18",
                  border: "1px solid #7c3aed",
                  borderRadius: "4px",
                  padding: "2px 8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#e0e0e8",
                  outline: "none",
                  width: "300px",
                }}
              />
            )}
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <AgentBadge agentId={sprint.agent.id} agentName={sprint.agent.name} />
            <span style={{
              fontSize: "10px",
              color: "#888898",
              background: "rgba(136,136,152,0.1)",
              border: "1px solid rgba(136,136,152,0.2)",
              borderRadius: "4px",
              padding: "2px 6px",
              fontWeight: 500,
              textTransform: "capitalize" as const,
            }}>
              {sprint.sprintType}
            </span>
            <span style={{
              fontSize: "10px",
              color: "#a855f7",
              background: "rgba(168,85,247,0.1)",
              border: "1px solid rgba(168,85,247,0.2)",
              borderRadius: "4px",
              padding: "2px 6px",
              fontWeight: 500,
            }}>
              {sprint.suggestedQaTier} QA
            </span>
            <ComplexityBadge complexity={sprint.estimatedComplexity} />
            {sprint.negotiated && (
              <span style={{
                fontSize: "10px",
                color: "#22c55e",
                background: "rgba(34,197,94,0.1)",
                border: "1px solid rgba(34,197,94,0.2)",
                borderRadius: "4px",
                padding: "2px 6px",
                fontWeight: 600,
              }}>
                ✓ Negotiated
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: "4px", alignItems: "flex-start", flexShrink: 0, marginLeft: "12px" }}>
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            style={{ background: "none", border: "none", cursor: index === 0 ? "default" : "pointer", color: index === 0 ? "#333345" : "#888898", padding: "3px", display: "flex" }}
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            style={{ background: "none", border: "none", cursor: index === total - 1 ? "default" : "pointer", color: index === total - 1 ? "#333345" : "#888898", padding: "3px", display: "flex" }}
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={() => setEditing(!editing)}
            style={{ background: "none", border: "1px solid #2a2a3a", borderRadius: "4px", cursor: "pointer", color: "#888898", padding: "3px 6px", fontSize: "11px" }}
          >
            {editing ? "Done" : "Edit"}
          </button>
          <button
            onClick={onRemove}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#555565", padding: "3px", display: "flex" }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Task description */}
      {!editing ? (
        <p style={{ margin: "0 0 10px", fontSize: "13px", color: "#888898", lineHeight: 1.5 }}>
          {sprint.task.length > 180 ? sprint.task.slice(0, 180) + "…" : sprint.task}
        </p>
      ) : (
        <div style={{ marginBottom: "12px" }}>
          <textarea
            value={editTask}
            onChange={(e) => setEditTask(e.target.value)}
            onBlur={() => onEdit({ task: editTask })}
            rows={4}
            style={{
              width: "100%",
              background: "#0d0d18",
              border: "1px solid #2a2a3a",
              borderRadius: "6px",
              padding: "8px 10px",
              fontSize: "13px",
              color: "#e0e0e8",
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
              lineHeight: 1.5,
              boxSizing: "border-box",
            }}
          />
          <div style={{ marginTop: "8px" }}>
            <label style={{ display: "block", fontSize: "11px", color: "#888898", marginBottom: "4px" }}>Agent</label>
            <select
              value={editAgent}
              onChange={(e) => {
                setEditAgent(e.target.value);
                const agents = getGeneratorAgents();
                const ag = agents.find(a => a.id === e.target.value);
                if (ag) onEdit({ agent: { id: ag.id, name: ag.name } });
              }}
              style={{
                background: "#0d0d18",
                border: "1px solid #2a2a3a",
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "12px",
                color: "#e0e0e8",
                outline: "none",
                cursor: "pointer",
              }}
            >
              {getGeneratorAgents().map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Dependencies */}
      {sprint.dependencies.length > 0 && (
        <div style={{ fontSize: "11px", color: "#555565", marginBottom: "8px" }}>
          Depends on: {sprint.dependencies.join(", ")}
        </div>
      )}

      {/* Negotiated preview */}
      {sprint.negotiated && sprint.devBrief && (
        <div style={{
          marginTop: "10px",
          padding: "10px 12px",
          background: "rgba(34,197,94,0.05)",
          border: "1px solid rgba(34,197,94,0.15)",
          borderRadius: "8px",
          fontSize: "12px",
          color: "#888898",
        }}>
          <div style={{ fontWeight: 600, color: "#22c55e", marginBottom: "6px" }}>Negotiated Contract</div>
          <div style={{ marginBottom: "4px" }}>
            <span style={{ color: "#555565" }}>DoD: </span>
            {sprint.devBrief.definitionOfDone.slice(0, 2).join(" · ")}
            {sprint.devBrief.definitionOfDone.length > 2 && ` · +${sprint.devBrief.definitionOfDone.length - 2} more`}
          </div>
          <div>
            <span style={{ color: "#555565" }}>Pass: </span>
            {sprint.qaBrief?.passCriteria.slice(0, 2).join(" · ")}
          </div>
        </div>
      )}

      {/* Negotiate button */}
      {!sprint.negotiated && !sprint.negotiating && (
        <button
          onClick={onNegotiate}
          style={{
            marginTop: "10px",
            padding: "6px 12px",
            background: "rgba(124,58,237,0.1)",
            border: "1px solid rgba(124,58,237,0.25)",
            borderRadius: "6px",
            color: "#a855f7",
            fontSize: "12px",
            fontWeight: 500,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <Handshake size={12} />
          Negotiate Contract
        </button>
      )}

      {sprint.negotiating && (
        <div style={{
          marginTop: "10px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "12px",
          color: "#888898",
        }}>
          <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
          Negotiating…
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

function BuilderInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: projects } = usePolling<Project[]>("/api/projects", 30000);

  const [step, setStep] = useState(1);
  const [prompt, setPrompt] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [context, setContext] = useState("");

  // Planning state
  const [planning, setPlanningState] = useState(false);
  const [planReasoning, setPlanReasoning] = useState("");
  const [sprints, setSprints] = useState<DraftSprint[]>([]);

  // Negotiating all state
  const [negotiatingAll, setNegotiatingAll] = useState(false);

  // Launch state
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");

  const selectedProjectObj = (projects || []).find(p => p.id === selectedProject);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.step) setStep(state.step);
        if (state.prompt) setPrompt(state.prompt);
        if (state.selectedProject) setSelectedProject(state.selectedProject);
        if (state.context) setContext(state.context);
        if (state.sprints) setSprints(state.sprints);
        if (state.planReasoning) setPlanReasoning(state.planReasoning);
      }
    } catch { /* ignore */ }
  }, [searchParams]);

  const saveToStorage = useCallback((updates: Record<string, unknown>) => {
    try {
      const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...updates }));
    } catch { /* ignore */ }
  }, []);

  const handlePlan = async () => {
    if (!prompt.trim()) return;
    setPlanningState(true);

    try {
      const res = await fetch("/api/builder/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, projectId: selectedProject, context }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("Planning failed: " + (err.error || "Unknown error"));
        return;
      }

      const data = await res.json();
      const plan = data.plan as { reasoning?: string; sprints?: SprintPlanItem[] };

      const draftSprints: DraftSprint[] = (plan.sprints || []).map((s: SprintPlanItem, i: number) => ({
        localId: `sprint-${Date.now()}-${i}`,
        name: s.name,
        task: s.task,
        sprintType: s.sprintType as DraftSprint["sprintType"],
        agent: s.agent,
        evaluator: s.evaluator,
        suggestedQaTier: s.suggestedQaTier,
        dependencies: s.dependencies || [],
        estimatedComplexity: s.estimatedComplexity,
      }));

      setSprints(draftSprints);
      setPlanReasoning(plan.reasoning || "");
      setStep(2);
      saveToStorage({ step: 2, sprints: draftSprints, planReasoning: plan.reasoning || "" });
    } catch (err) {
      alert("Planning request failed: " + String(err));
    } finally {
      setPlanningState(false);
    }
  };

  const updateSprint = (localId: string, updates: Partial<DraftSprint>) => {
    setSprints(prev => {
      const updated = prev.map(s => s.localId === localId ? { ...s, ...updates } : s);
      saveToStorage({ sprints: updated });
      return updated;
    });
  };

  const removeSprint = (localId: string) => {
    setSprints(prev => {
      const updated = prev.filter(s => s.localId !== localId);
      saveToStorage({ sprints: updated });
      return updated;
    });
  };

  const moveSprint = (index: number, dir: "up" | "down") => {
    setSprints(prev => {
      const arr = [...prev];
      const swap = dir === "up" ? index - 1 : index + 1;
      if (swap < 0 || swap >= arr.length) return arr;
      [arr[index], arr[swap]] = [arr[swap], arr[index]];
      saveToStorage({ sprints: arr });
      return arr;
    });
  };

  const addSprint = () => {
    const newSprint: DraftSprint = {
      localId: `sprint-${Date.now()}`,
      name: "New Sprint",
      task: "",
      sprintType: "code",
      agent: { id: "dev", name: "Devin" },
      evaluator: { id: "qa", name: "Quinn" },
      suggestedQaTier: "targeted",
      dependencies: [],
      estimatedComplexity: "medium",
    };
    setSprints(prev => {
      const updated = [...prev, newSprint];
      saveToStorage({ sprints: updated });
      return updated;
    });
  };

  const negotiateSprint = async (localId: string) => {
    const sprint = sprints.find(s => s.localId === localId);
    if (!sprint) return;

    updateSprint(localId, { negotiating: true });

    try {
      const res = await fetch("/api/builder/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprint, projectId: selectedProject }),
      });

      if (!res.ok) {
        updateSprint(localId, { negotiating: false });
        return;
      }

      const data = await res.json();
      updateSprint(localId, {
        negotiating: false,
        negotiated: true,
        devBrief: data.negotiated.devBrief,
        qaBrief: data.negotiated.qaBrief,
        generatorBrief: data.generatorBrief,
        evaluatorBrief: data.evaluatorBrief,
      });
    } catch {
      updateSprint(localId, { negotiating: false });
    }
  };

  const negotiateAll = async () => {
    setNegotiatingAll(true);
    for (const sprint of sprints) {
      if (!sprint.negotiated) {
        await negotiateSprint(sprint.localId);
      }
    }
    setNegotiatingAll(false);
  };

  const handleQueueAll = async () => {
    if (sprints.length === 0) return;
    setSaving(true);
    setSaveMsg("");

    const projectConfig = selectedProjectObj;
    const repo = (projectConfig as { repo?: string })?.repo || ".";
    const planId = `plan-${Date.now().toString(36)}`;

    const results: { queued: number; errors: number } = { queued: 0, errors: 0 };

    for (let i = 0; i < sprints.length; i++) {
      const sprint = sprints[i];
      try {
        const id = `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const contract = {
          id,
          name: sprint.name,
          task: sprint.task,
          projectId: selectedProject || undefined,
          status: "approved",
          sprintType: sprint.sprintType,
          agentConfig: {
            generator: { agentId: sprint.agent.id, agentName: sprint.agent.name },
            evaluator: { agentId: sprint.evaluator.id, agentName: sprint.evaluator.name },
          },
          planId,
          plannerOutput: planReasoning,
          agents: {
            generator: { type: "openclaw", model: "claude-sonnet-4-5" },
            evaluator: { type: "openclaw", model: "claude-sonnet-4-5" },
          },
          priorities: { speed: 2, quality: 1, cost: 3 },
          human: {
            checkpoints: ["On completion", "On escalation"],
            notificationChannel: "telegram",
            responseTimeoutMinutes: 30,
            onTimeout: "proceed",
          },
          devBrief: sprint.devBrief || {
            repo,
            constraints: ["Follow existing code patterns and conventions", "Maintain backward compatibility"],
            definitionOfDone: ["Feature works as described", "No regressions introduced"],
          },
          qaBrief: sprint.qaBrief || {
            tier: sprint.suggestedQaTier,
            testUrl: "",
            testFocus: ["Core functionality", "Edge cases"],
            passCriteria: ["Zero P0 defects", "Zero P1 defects"],
            knownLimitations: [],
          },
          graders: [
            { id: "ux-quinn", type: "ux", name: "Quinn (UX)", enabled: true, model: "claude-sonnet-4-5" },
          ],
          iterations: [],
          createdAt: new Date().toISOString(),
        };

        const saveRes = await fetch("/api/builder/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contract }),
        });

        if (!saveRes.ok) {
          results.errors++;
          continue;
        }

        // Queue the sprint
        const runRes = await fetch("/api/sprints/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contractId: id, enqueue: i > 0 }),
        });

        if (runRes.ok) {
          results.queued++;
        } else {
          results.errors++;
        }
      } catch {
        results.errors++;
      }
    }

    setSaving(false);

    if (results.errors === 0) {
      setSaveMsg(`${results.queued} sprint${results.queued !== 1 ? "s" : ""} queued! Redirecting...`);
      localStorage.removeItem(STORAGE_KEY);
      setTimeout(() => router.push("/live"), 1500);
    } else {
      setSaveMsg(`${results.queued} queued, ${results.errors} failed. Check /sprints.`);
    }
  };

  // ─── Step 1: Describe ─────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div style={{ maxWidth: "680px", margin: "0 auto" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: "26px", fontWeight: 700, color: "#e0e0e8" }}>
          Sprint Builder
        </h1>
        <p style={{ margin: 0, fontSize: "14px", color: "#888898" }}>
          Describe what you want built. The planner will decompose it into focused agent sprints.
        </p>
      </div>

      <div style={{ background: "#141420", border: "1px solid #2a2a3a", borderRadius: "12px", padding: "28px" }}>
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#e0e0e8", marginBottom: "8px" }}>
            What do you want built?
          </label>
          <textarea
            value={prompt}
            onChange={(e) => { setPrompt(e.target.value); saveToStorage({ prompt: e.target.value }); }}
            placeholder="Paste a client email, feature request, bug report, or just describe the task..."
            rows={7}
            style={{
              width: "100%", background: "#0d0d18", border: "1px solid #2a2a3a", borderRadius: "8px",
              padding: "12px 14px", fontSize: "14px", color: "#e0e0e8", outline: "none",
              resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#e0e0e8", marginBottom: "8px" }}>
            Project
          </label>
          <select
            value={selectedProject}
            onChange={(e) => { setSelectedProject(e.target.value); saveToStorage({ selectedProject: e.target.value }); }}
            style={{
              width: "100%", background: "#0d0d18", border: "1px solid #2a2a3a", borderRadius: "8px",
              padding: "10px 14px", fontSize: "14px", color: "#e0e0e8", outline: "none", cursor: "pointer",
            }}
          >
            <option value="">— Select a project —</option>
            {(projects || []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: "28px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#e0e0e8", marginBottom: "8px" }}>
            Additional context{" "}
            <span style={{ color: "#555565", fontWeight: 400 }}>(optional)</span>
          </label>
          <textarea
            value={context}
            onChange={(e) => { setContext(e.target.value); saveToStorage({ context: e.target.value }); }}
            placeholder="Constraints, tech stack details, related tickets, anything else the agent should know..."
            rows={3}
            style={{
              width: "100%", background: "#0d0d18", border: "1px solid #2a2a3a", borderRadius: "8px",
              padding: "12px 14px", fontSize: "14px", color: "#e0e0e8", outline: "none",
              resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box",
            }}
          />
        </div>

        <button
          onClick={handlePlan}
          disabled={!prompt.trim() || planning}
          style={{
            width: "100%", padding: "13px",
            background: prompt.trim() && !planning ? "linear-gradient(135deg, #7c3aed, #a855f7)" : "#2a2a3a",
            border: "none", borderRadius: "8px",
            color: prompt.trim() && !planning ? "white" : "#555565",
            fontSize: "15px", fontWeight: 600,
            cursor: prompt.trim() && !planning ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            transition: "all 0.15s",
          }}
        >
          {planning ? (
            <>
              <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
              Planning… (may take 30–60s)
            </>
          ) : (
            <>
              <Wand2 size={18} />
              Plan Sprints
            </>
          )}
        </button>
      </div>
    </div>
  );

  // ─── Step 2: Review & Edit ────────────────────────────────────────────────

  const renderStep2 = () => (
    <div style={{ maxWidth: "760px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          onClick={() => setStep(1)}
          style={{
            background: "none", border: "1px solid #2a2a3a", borderRadius: "8px",
            padding: "6px 12px", color: "#888898", cursor: "pointer",
            display: "flex", alignItems: "center", gap: "6px", fontSize: "13px",
          }}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "#e0e0e8" }}>
          Review & Edit Sprints
        </h1>
      </div>

      {/* Planner reasoning */}
      {planReasoning && (
        <div style={{
          background: "rgba(124,58,237,0.06)",
          border: "1px solid rgba(124,58,237,0.2)",
          borderRadius: "10px",
          padding: "14px 16px",
          marginBottom: "20px",
          fontSize: "13px",
          color: "#888898",
          lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 600, color: "#a855f7", marginBottom: "6px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Planner Reasoning
          </div>
          {planReasoning}
        </div>
      )}

      {/* Sprint cards */}
      {sprints.length === 0 ? (
        <div style={{ textAlign: "center", color: "#555565", padding: "40px", fontSize: "14px" }}>
          No sprints yet. Add one below or go back and re-plan.
        </div>
      ) : (
        sprints.map((sprint, i) => (
          <SprintCard
            key={sprint.localId}
            sprint={sprint}
            index={i}
            total={sprints.length}
            onEdit={(updates) => updateSprint(sprint.localId, updates)}
            onRemove={() => removeSprint(sprint.localId)}
            onMoveUp={() => moveSprint(i, "up")}
            onMoveDown={() => moveSprint(i, "down")}
            onNegotiate={() => negotiateSprint(sprint.localId)}
            projectRepo={(selectedProjectObj as { repo?: string })?.repo || "."}
          />
        ))
      )}

      {/* Add sprint */}
      <button
        onClick={addSprint}
        style={{
          width: "100%", padding: "10px",
          background: "transparent", border: "1px dashed #2a2a3a",
          borderRadius: "10px", color: "#555565", fontSize: "13px",
          cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "center", gap: "6px", marginBottom: "20px",
          transition: "all 0.15s",
        }}
      >
        <Plus size={14} />
        Add Sprint
      </button>

      {/* Negotiate All */}
      {sprints.some(s => !s.negotiated) && (
        <div style={{
          background: "#141420",
          border: "1px solid #2a2a3a",
          borderRadius: "10px",
          padding: "16px 20px",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "#e0e0e8", marginBottom: "2px" }}>
              Negotiate Contracts
            </div>
            <div style={{ fontSize: "12px", color: "#555565" }}>
              Each agent reviews the sprint and proposes their definition of done.
              Quinn tightens pass criteria.
            </div>
          </div>
          <button
            onClick={negotiateAll}
            disabled={negotiatingAll}
            style={{
              padding: "9px 18px",
              background: negotiatingAll ? "#2a2a3a" : "rgba(124,58,237,0.15)",
              border: negotiatingAll ? "1px solid #2a2a3a" : "1px solid rgba(124,58,237,0.35)",
              borderRadius: "8px",
              color: negotiatingAll ? "#555565" : "#a855f7",
              fontSize: "13px", fontWeight: 600, cursor: negotiatingAll ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: "7px", whiteSpace: "nowrap",
              flexShrink: 0, marginLeft: "16px",
            }}
          >
            {negotiatingAll ? (
              <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Negotiating…</>
            ) : (
              <><Handshake size={14} /> Negotiate All</>
            )}
          </button>
        </div>
      )}

      {/* Continue */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => { setStep(3); saveToStorage({ step: 3 }); }}
          disabled={sprints.length === 0}
          style={{
            padding: "11px 24px",
            background: sprints.length > 0 ? "linear-gradient(135deg, #7c3aed, #a855f7)" : "#2a2a3a",
            border: "none", borderRadius: "8px",
            color: sprints.length > 0 ? "white" : "#555565",
            fontSize: "14px", fontWeight: 600,
            cursor: sprints.length > 0 ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", gap: "8px",
          }}
        >
          Continue to Launch
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );

  // ─── Step 3: Confirm & Run ────────────────────────────────────────────────

  const renderStep3 = () => (
    <div style={{ maxWidth: "620px", margin: "0 auto" }}>
      <div style={{ marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          onClick={() => setStep(2)}
          style={{
            background: "none", border: "1px solid #2a2a3a", borderRadius: "8px",
            padding: "6px 12px", color: "#888898", cursor: "pointer",
            display: "flex", alignItems: "center", gap: "6px", fontSize: "13px",
          }}
        >
          <ArrowLeft size={14} /> Back to Edit
        </button>
        <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "#e0e0e8" }}>
          Confirm & Queue
        </h1>
      </div>

      {/* Sprint summary */}
      <div style={{
        background: "#141420",
        border: "1px solid #2a2a3a",
        borderRadius: "12px",
        padding: "20px",
        marginBottom: "16px",
      }}>
        <div style={{ fontSize: "11px", color: "#555565", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "14px" }}>
          {sprints.length} Sprint{sprints.length !== 1 ? "s" : ""} to Queue
        </div>
        {sprints.map((sprint, i) => (
          <div
            key={sprint.localId}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 0",
              borderTop: i > 0 ? "1px solid #1e1e2e" : "none",
            }}
          >
            <span style={{ fontSize: "12px", color: "#555565", width: "20px", flexShrink: 0 }}>
              {i + 1}.
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e8", marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {sprint.name}
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <AgentBadge agentId={sprint.agent.id} agentName={sprint.agent.name} />
                <span style={{ fontSize: "10px", color: "#888898" }}>{sprint.suggestedQaTier} QA</span>
                {sprint.negotiated && (
                  <span style={{ fontSize: "10px", color: "#22c55e" }}>✓ negotiated</span>
                )}
              </div>
            </div>
            {sprint.dependencies.length > 0 && (
              <span style={{ fontSize: "10px", color: "#555565", flexShrink: 0 }}>
                after #{sprints.findIndex(s => sprint.dependencies.includes(s.name)) + 1}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {/* Queue All */}
        <button
          onClick={handleQueueAll}
          disabled={saving}
          style={{
            padding: "16px 24px",
            background: saving ? "#2a2a3a" : "linear-gradient(135deg, #7c3aed, #a855f7)",
            border: "none", borderRadius: "10px",
            color: saving ? "#555565" : "white",
            fontSize: "15px", fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
            transition: "all 0.15s",
          }}
        >
          {saving ? (
            <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Queuing sprints…</>
          ) : (
            <><Rocket size={18} /> Queue All Sprints</>
          )}
        </button>

        {/* Schedule */}
        <div style={{
          background: "#141420",
          border: "1px solid #2a2a3a",
          borderRadius: "10px",
          padding: "16px 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <Clock size={16} color="#888898" />
            <span style={{ fontSize: "14px", fontWeight: 500, color: "#e0e0e8" }}>Schedule First Sprint</span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              style={{
                flex: 1, background: "#0d0d18", border: "1px solid #2a2a3a",
                borderRadius: "6px", padding: "8px 12px", fontSize: "13px",
                color: "#e0e0e8", outline: "none", colorScheme: "dark",
              }}
            />
            <button
              disabled={!scheduledFor || saving}
              style={{
                padding: "8px 16px",
                background: scheduledFor ? "rgba(124,58,237,0.15)" : "#1a1a2a",
                border: scheduledFor ? "1px solid rgba(124,58,237,0.4)" : "1px solid #2a2a3a",
                borderRadius: "6px",
                color: scheduledFor ? "#a855f7" : "#555565",
                fontSize: "13px", fontWeight: 500,
                cursor: scheduledFor && !saving ? "pointer" : "not-allowed",
                whiteSpace: "nowrap",
              }}
            >
              Schedule
            </button>
          </div>
        </div>

        {/* Save as Draft */}
        <button
          onClick={() => { setSaveMsg("Draft saved (use /sprints to review)"); }}
          disabled={saving}
          style={{
            padding: "14px 24px", background: "transparent", border: "1px solid #2a2a3a",
            borderRadius: "10px", color: "#888898", fontSize: "14px", fontWeight: 500,
            cursor: saving ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          }}
        >
          <Save size={16} />
          Save as Draft
        </button>
      </div>

      {saveMsg && (
        <div style={{
          marginTop: "16px", padding: "12px 16px",
          background: saveMsg.includes("failed") ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
          border: `1px solid ${saveMsg.includes("failed") ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
          borderRadius: "8px", fontSize: "13px",
          color: saveMsg.includes("failed") ? "#ef4444" : "#22c55e",
          textAlign: "center",
        }}>
          {saveMsg}
        </div>
      )}
    </div>
  );

  // ─── Step indicator ──────────────────────────────────────────────────────

  const steps = [
    { num: 1, label: "Describe" },
    { num: 2, label: "Review" },
    { num: 3, label: "Launch" },
  ];

  return (
    <div style={{ padding: "32px", minHeight: "100vh" }}>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Step indicator */}
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        marginBottom: "32px", maxWidth: "760px", margin: "0 auto 32px",
      }}>
        {steps.map((s, i) => {
          const active = step === s.num;
          const done = step > s.num;
          return (
            <div key={s.num} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "4px 12px", borderRadius: "20px",
                background: active ? "rgba(124,58,237,0.15)" : done ? "rgba(34,197,94,0.1)" : "transparent",
                border: `1px solid ${active ? "#7c3aed" : done ? "rgba(34,197,94,0.3)" : "#2a2a3a"}`,
              }}>
                <span style={{
                  width: "18px", height: "18px", borderRadius: "50%",
                  background: active ? "#7c3aed" : done ? "#22c55e" : "#2a2a3a",
                  color: "white", fontSize: "10px", fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {done ? "✓" : s.num}
                </span>
                <span style={{
                  fontSize: "12px", fontWeight: active ? 600 : 400,
                  color: active ? "#a855f7" : done ? "#22c55e" : "#888898",
                }}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div style={{ width: "24px", height: "1px", background: step > s.num ? "rgba(34,197,94,0.4)" : "#2a2a3a" }} />
              )}
            </div>
          );
        })}
      </div>

      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
    </div>
  );
}

export default function BuilderPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: "32px", color: "#888898", fontSize: "14px" }}>Loading builder...</div>
    }>
      <BuilderInner />
    </Suspense>
  );
}
