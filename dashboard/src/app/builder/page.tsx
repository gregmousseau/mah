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
} from "lucide-react";
import { usePolling } from "@/hooks/usePolling";
import type { Project } from "@/types/mah";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentConfig {
  type: string;
  model: string;
}

interface GraderConfig {
  id: string;
  type: "ux" | "code-review" | "accessibility" | "performance" | "custom";
  name: string;
  description: string;
  costRange: string;
  enabled: boolean;
  model: string;
  comingSoon?: boolean;
}

interface BuilderContract {
  id: string;
  name: string;
  task: string;
  projectId?: string;
  status: "draft" | "scheduled" | "approved" | "planned";
  agents: { generator: AgentConfig; evaluator: AgentConfig };
  priorities: { speed: number; quality: number; cost: number };
  human: {
    checkpoints: string[];
    notificationChannel: string;
    responseTimeoutMinutes: number;
    onTimeout: string;
  };
  devBrief: { repo: string; constraints: string[]; definitionOfDone: string[] };
  qaBrief: {
    tier: string;
    testUrl: string;
    testFocus: string[];
    passCriteria: string[];
    knownLimitations: string[];
  };
  graders?: GraderConfig[];
  iterations: unknown[];
  createdAt: string;
  scheduledFor?: string;
}

interface CostEstimate {
  devLow: number;
  devHigh: number;
  qaLow: number;
  qaHigh: number;
  totalLow: number;
  totalHigh: number;
  estimatedIterations: number;
}

const STORAGE_KEY = "mah-builder-state";

const MODEL_OPTIONS = [
  { value: "claude-haiku-3-5", label: "Haiku 3.5", cost: "$" as const },
  { value: "claude-sonnet-4-5", label: "Sonnet 4.5", cost: "$$" as const },
  { value: "claude-opus-4", label: "Opus 4", cost: "$$$" as const },
];

const ADAPTER_OPTIONS = [
  { value: "openclaw", label: "OpenClaw" },
  { value: "claude-cli", label: "Claude CLI" },
  { value: "codex", label: "Codex" },
];

const DEFAULT_GRADERS: GraderConfig[] = [
  {
    id: "ux-quinn",
    type: "ux",
    name: "Quinn (UX)",
    description: "Browser testing, device matrix, visual verification",
    costRange: "$0.50–5.00",
    enabled: true,
    model: "claude-sonnet-4-5",
  },
  {
    id: "code-review",
    type: "code-review",
    name: "Code Reviewer",
    description: "Bug risks, security, performance, style",
    costRange: "$0.10–0.50",
    enabled: true,
    model: "claude-sonnet-4-5",
  },
  {
    id: "accessibility",
    type: "accessibility",
    name: "Accessibility",
    description: "WCAG compliance, ARIA, keyboard navigation",
    costRange: "$0.20–0.80",
    enabled: false,
    model: "claude-sonnet-4-5",
    comingSoon: true,
  },
  {
    id: "performance",
    type: "performance",
    name: "Performance",
    description: "Lighthouse audit, bundle size, Core Web Vitals",
    costRange: "$0.10–0.40",
    enabled: false,
    model: "claude-haiku-3-5",
    comingSoon: true,
  },
];

const QA_TIERS = [
  {
    id: "smoke",
    label: "Smoke",
    desc: "Quick sanity check",
    devices: "2 devices, 1 browser",
    costRange: "$0.10–0.30",
    costLow: 0.10,
    costHigh: 0.30,
    icon: "💨",
  },
  {
    id: "targeted",
    label: "Targeted",
    desc: "Key flows verified",
    devices: "4 devices, 2 browsers",
    costRange: "$0.50–1.50",
    costLow: 0.50,
    costHigh: 1.50,
    icon: "🎯",
  },
  {
    id: "full",
    label: "Full Matrix",
    desc: "Everything tested",
    devices: "8 devices, 3 browsers",
    costRange: "$2.00–5.00",
    costLow: 2.00,
    costHigh: 5.00,
    icon: "🔬",
  },
];

const PRIORITY_ITEMS = ["Speed", "Quality", "Cost"] as const;
type Priority = (typeof PRIORITY_ITEMS)[number];

const PRIORITY_DESCRIPTIONS: Record<Priority, string> = {
  Speed: "Dev self-reviews before QA. Smoke tests first. Fast models.",
  Quality: "Full matrix QA. Multiple graders. Thorough iteration.",
  Cost: "Haiku where possible. Human reviews findings. Minimal iterations.",
};

const HUMAN_CHECKPOINTS = [
  "Before running",
  "On QA failure",
  "On completion",
  "On escalation",
];

// ─── Small helpers ────────────────────────────────────────────────────────────

function CostIndicator({ cost }: { cost: "$" | "$$" | "$$$" }) {
  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 600,
        color: cost === "$" ? "#22c55e" : cost === "$$" ? "#f59e0b" : "#ef4444",
        background:
          cost === "$"
            ? "rgba(34,197,94,0.1)"
            : cost === "$$"
            ? "rgba(245,158,11,0.1)"
            : "rgba(239,68,68,0.1)",
        border: `1px solid ${
          cost === "$"
            ? "rgba(34,197,94,0.25)"
            : cost === "$$"
            ? "rgba(245,158,11,0.25)"
            : "rgba(239,68,68,0.25)"
        }`,
        borderRadius: "4px",
        padding: "1px 5px",
      }}
    >
      {cost}
    </span>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#141420",
        border: "1px solid #2a2a3a",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "16px",
      }}
    >
      <h3
        style={{
          margin: "0 0 16px",
          fontSize: "13px",
          fontWeight: 600,
          color: "#a855f7",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function EditableList({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  const [newItem, setNewItem] = useState("");

  const add = () => {
    const trimmed = newItem.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
      setNewItem("");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "rgba(124,58,237,0.12)",
              border: "1px solid rgba(124,58,237,0.25)",
              borderRadius: "6px",
              padding: "3px 8px",
              fontSize: "12px",
              color: "#e0e0e8",
            }}
          >
            {item}
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#888898",
                padding: "0 0 0 2px",
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={placeholder}
          style={{
            flex: 1,
            background: "#0d0d18",
            border: "1px solid #2a2a3a",
            borderRadius: "6px",
            padding: "6px 10px",
            fontSize: "12px",
            color: "#e0e0e8",
            outline: "none",
          }}
        />
        <button
          onClick={add}
          style={{
            background: "rgba(124,58,237,0.15)",
            border: "1px solid rgba(124,58,237,0.3)",
            borderRadius: "6px",
            padding: "6px 10px",
            color: "#a855f7",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function EditableChecklist({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  const [newItem, setNewItem] = useState("");

  const add = () => {
    const trimmed = newItem.trim();
    if (trimmed) {
      onChange([...items, trimmed]);
      setNewItem("");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "8px" }}>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 10px",
              background: "#0d0d18",
              border: "1px solid #2a2a3a",
              borderRadius: "6px",
            }}
          >
            <div
              style={{
                width: "14px",
                height: "14px",
                borderRadius: "3px",
                border: "1px solid #7c3aed",
                background: "rgba(124,58,237,0.2)",
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, fontSize: "13px", color: "#e0e0e8" }}>{item}</span>
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#555565",
                padding: "0",
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={placeholder}
          style={{
            flex: 1,
            background: "#0d0d18",
            border: "1px solid #2a2a3a",
            borderRadius: "6px",
            padding: "6px 10px",
            fontSize: "12px",
            color: "#e0e0e8",
            outline: "none",
          }}
        />
        <button
          onClick={add}
          style={{
            background: "rgba(124,58,237,0.15)",
            border: "1px solid rgba(124,58,237,0.3)",
            borderRadius: "6px",
            padding: "6px 10px",
            color: "#a855f7",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Plus size={14} />
        </button>
      </div>
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
  const [contract, setContract] = useState<BuilderContract | null>(null);
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);
  const [scheduledFor, setScheduledFor] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [priorityOrder, setPriorityOrder] = useState<Priority[]>(["Quality", "Speed", "Cost"]);
  const [graders, setGraders] = useState<GraderConfig[]>(DEFAULT_GRADERS);

  // Load saved state from localStorage or resume from URL param
  useEffect(() => {
    const resumeId = searchParams.get("resume");
    if (resumeId) {
      // Load specific draft
      fetch("/api/builder/drafts")
        .then((r) => r.json())
        .then((drafts: BuilderContract[]) => {
          const found = drafts.find((d) => d.id === resumeId);
          if (found) {
            setContract(found);
            setPrompt(found.task || "");
            setSelectedProject(found.projectId || "");
            if (found.priorities) {
              const sorted = Object.entries(found.priorities)
                .sort((a, b) => (a[1] as number) - (b[1] as number))
                .map(([k]) => (k.charAt(0).toUpperCase() + k.slice(1)) as Priority);
              setPriorityOrder(sorted);
            }
            setStep(2);
          }
        })
        .catch(() => {});
      return;
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.step) setStep(state.step);
        if (state.prompt) setPrompt(state.prompt);
        if (state.selectedProject) setSelectedProject(state.selectedProject);
        if (state.context) setContext(state.context);
        if (state.contract) setContract(state.contract);
        if (state.costEstimate) setCostEstimate(state.costEstimate);
        if (state.priorityOrder) setPriorityOrder(state.priorityOrder);
      }
    } catch {}
  }, [searchParams]);

  // Save state to localStorage whenever it changes
  const saveToStorage = useCallback(
    (updates: Partial<{
      step: number;
      prompt: string;
      selectedProject: string;
      context: string;
      contract: BuilderContract | null;
      costEstimate: CostEstimate | null;
      priorityOrder: Priority[];
    }>) => {
      try {
        const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...updates }));
      } catch {}
    },
    []
  );

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    const res = await fetch("/api/builder/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, projectId: selectedProject, context }),
    });

    if (!res.ok) return;
    const data = await res.json();

    // Derive priority order from priorities object
    const p = data.contract.priorities;
    const sorted = Object.entries(p)
      .sort((a, b) => (a[1] as number) - (b[1] as number))
      .map(([k]) => (k.charAt(0).toUpperCase() + k.slice(1)) as Priority);
    setPriorityOrder(sorted);

    setContract(data.contract);
    setCostEstimate(data.costEstimate);
    setStep(2);
    saveToStorage({ step: 2, contract: data.contract, costEstimate: data.costEstimate, priorityOrder: sorted });
  };

  const updateContract = (updates: Partial<BuilderContract>) => {
    if (!contract) return;
    const updated = { ...contract, ...updates };
    setContract(updated);
    saveToStorage({ contract: updated });
  };

  // Recompute costs when model or tier changes
  const recomputeCosts = (model: string, tier: string, iterations: number) => {
    const modelCosts: Record<string, { low: number; high: number }> = {
      "claude-haiku-3-5": { low: 0.05, high: 0.20 },
      "claude-sonnet-4-5": { low: 0.15, high: 0.50 },
      "claude-opus-4": { low: 0.50, high: 2.00 },
    };
    const qaCosts: Record<string, { low: number; high: number }> = {
      smoke: { low: 0.10, high: 0.30 },
      targeted: { low: 0.50, high: 1.50 },
      full: { low: 2.00, high: 5.00 },
    };
    const mc = modelCosts[model] || { low: 0.15, high: 0.50 };
    const qc = qaCosts[tier] || { low: 0.50, high: 1.50 };
    const est: CostEstimate = {
      devLow: mc.low * iterations,
      devHigh: mc.high * iterations,
      qaLow: qc.low * iterations,
      qaHigh: qc.high * iterations,
      totalLow: (mc.low + qc.low) * iterations,
      totalHigh: (mc.high + qc.high) * iterations,
      estimatedIterations: iterations,
    };
    setCostEstimate(est);
    saveToStorage({ costEstimate: est });
  };

  const handleSave = async (
    status: "draft" | "approved" | "scheduled",
    schedFor?: string
  ) => {
    if (!contract) return;
    setSaving(true);
    setSaveMsg("");

    try {
      const contractToSave = {
        ...contract,
        status: schedFor ? "scheduled" : status,
        priorities: priorityOrderToMap(priorityOrder),
        graders,
      };

      const saveRes = await fetch("/api/builder/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contract: contractToSave, scheduledFor: schedFor }),
      });

      if (!saveRes.ok) {
        setSaveMsg("Save failed. Try again.");
        return;
      }

      if (status === "approved" && !schedFor) {
        // Run Now: queue and redirect to live
        setSaveMsg("Sprint queued! Redirecting to live view...");
        const runRes = await fetch("/api/sprints/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contractId: contractToSave.id }),
        });
        if (!runRes.ok) {
          setSaveMsg("Sprint saved but failed to queue. Check /sprints.");
          return;
        }
        localStorage.removeItem(STORAGE_KEY);
        setTimeout(() => router.push("/live"), 1200);
      } else if (schedFor) {
        // Schedule: show confirmation, stay on page
        const dt = new Date(schedFor).toLocaleString("en-CA", {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        });
        setSaveMsg(`Sprint scheduled for ${dt}`);
        localStorage.removeItem(STORAGE_KEY);
        setTimeout(() => router.push("/sprints"), 2000);
      } else {
        setSaveMsg("Draft saved!");
        localStorage.removeItem(STORAGE_KEY);
        setTimeout(() => router.push("/sprints"), 1200);
      }
    } finally {
      setSaving(false);
    }
  };

  const priorityOrderToMap = (order: Priority[]) => {
    const map: Record<string, number> = {};
    order.forEach((p, i) => {
      map[p.toLowerCase()] = i + 1;
    });
    return map as { speed: number; quality: number; cost: number };
  };

  const movePriority = (index: number, direction: "up" | "down") => {
    const newOrder = [...priorityOrder];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newOrder.length) return;
    [newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]];
    setPriorityOrder(newOrder);
    saveToStorage({ priorityOrder: newOrder });
  };

  // ─── Step 1: Input ──────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div style={{ maxWidth: "680px", margin: "0 auto" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: "26px", fontWeight: 700, color: "#e0e0e8" }}>
          Sprint Builder
        </h1>
        <p style={{ margin: 0, fontSize: "14px", color: "#888898" }}>
          Describe what you want built. We&apos;ll generate a complete sprint contract.
        </p>
      </div>

      <div
        style={{
          background: "#141420",
          border: "1px solid #2a2a3a",
          borderRadius: "12px",
          padding: "28px",
        }}
      >
        {/* Prompt */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#e0e0e8", marginBottom: "8px" }}>
            What do you want built?
          </label>
          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              saveToStorage({ prompt: e.target.value });
            }}
            placeholder="Paste a client email, feature request, bug report, or just describe the task..."
            rows={7}
            style={{
              width: "100%",
              background: "#0d0d18",
              border: "1px solid #2a2a3a",
              borderRadius: "8px",
              padding: "12px 14px",
              fontSize: "14px",
              color: "#e0e0e8",
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
              lineHeight: 1.6,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Project */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#e0e0e8", marginBottom: "8px" }}>
            Project
          </label>
          <select
            value={selectedProject}
            onChange={(e) => {
              setSelectedProject(e.target.value);
              saveToStorage({ selectedProject: e.target.value });
            }}
            style={{
              width: "100%",
              background: "#0d0d18",
              border: "1px solid #2a2a3a",
              borderRadius: "8px",
              padding: "10px 14px",
              fontSize: "14px",
              color: "#e0e0e8",
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="">— Select a project —</option>
            {(projects || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="new">+ New Project</option>
          </select>
        </div>

        {/* Context */}
        <div style={{ marginBottom: "28px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#e0e0e8", marginBottom: "8px" }}>
            Additional context{" "}
            <span style={{ color: "#555565", fontWeight: 400 }}>(optional)</span>
          </label>
          <textarea
            value={context}
            onChange={(e) => {
              setContext(e.target.value);
              saveToStorage({ context: e.target.value });
            }}
            placeholder="Constraints, tech stack details, related tickets, anything else the agent should know..."
            rows={3}
            style={{
              width: "100%",
              background: "#0d0d18",
              border: "1px solid #2a2a3a",
              borderRadius: "8px",
              padding: "12px 14px",
              fontSize: "14px",
              color: "#e0e0e8",
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
              lineHeight: 1.6,
              boxSizing: "border-box",
            }}
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={!prompt.trim()}
          style={{
            width: "100%",
            padding: "13px",
            background: prompt.trim()
              ? "linear-gradient(135deg, #7c3aed, #a855f7)"
              : "#2a2a3a",
            border: "none",
            borderRadius: "8px",
            color: prompt.trim() ? "white" : "#555565",
            fontSize: "15px",
            fontWeight: 600,
            cursor: prompt.trim() ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.15s",
          }}
        >
          <Wand2 size={18} />
          Generate Sprint Contract
        </button>
      </div>
    </div>
  );

  // ─── Step 2: Review/Edit ────────────────────────────────────────────────────

  const renderStep2 = () => {
    if (!contract) return null;
    const generatorModel = contract.agents.generator.model;
    const evaluatorModel = contract.agents.evaluator.model;
    const currentTier = contract.qaBrief.tier;

    return (
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>
        <div style={{ marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={() => setStep(1)}
            style={{
              background: "none",
              border: "1px solid #2a2a3a",
              borderRadius: "8px",
              padding: "6px 12px",
              color: "#888898",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "13px",
            }}
          >
            <ArrowLeft size={14} /> Back
          </button>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "#e0e0e8" }}>
            Review Contract
          </h1>
        </div>

        {/* Task */}
        <SectionCard title="Task">
          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "#888898", marginBottom: "4px" }}>Name</label>
            <input
              value={contract.name}
              onChange={(e) => updateContract({ name: e.target.value })}
              style={{
                width: "100%",
                background: "#0d0d18",
                border: "1px solid #2a2a3a",
                borderRadius: "6px",
                padding: "8px 12px",
                fontSize: "14px",
                color: "#e0e0e8",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#888898", marginBottom: "4px" }}>Description</label>
            <textarea
              value={contract.task}
              onChange={(e) => updateContract({ task: e.target.value })}
              rows={4}
              style={{
                width: "100%",
                background: "#0d0d18",
                border: "1px solid #2a2a3a",
                borderRadius: "6px",
                padding: "8px 12px",
                fontSize: "13px",
                color: "#e0e0e8",
                outline: "none",
                resize: "vertical",
                fontFamily: "inherit",
                lineHeight: 1.5,
                boxSizing: "border-box",
              }}
            />
          </div>
        </SectionCard>

        {/* Agent Team */}
        <SectionCard title="Agent Team">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {(["generator", "evaluator"] as const).map((role) => {
              const agent = contract.agents[role];
              const modelInfo = MODEL_OPTIONS.find((m) => m.value === agent.model);
              return (
                <div key={role}>
                  <label style={{ display: "block", fontSize: "12px", color: "#888898", marginBottom: "6px", textTransform: "capitalize" }}>
                    {role}
                  </label>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <select
                      value={agent.model}
                      onChange={(e) => {
                        const newAgents = {
                          ...contract.agents,
                          [role]: { ...agent, model: e.target.value },
                        };
                        updateContract({ agents: newAgents });
                        if (role === "generator") {
                          recomputeCosts(e.target.value, currentTier, costEstimate?.estimatedIterations || 2);
                        }
                      }}
                      style={{
                        flex: 1,
                        background: "#0d0d18",
                        border: "1px solid #2a2a3a",
                        borderRadius: "6px",
                        padding: "7px 10px",
                        fontSize: "13px",
                        color: "#e0e0e8",
                        outline: "none",
                      }}
                    >
                      {MODEL_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    {modelInfo && <CostIndicator cost={modelInfo.cost} />}
                  </div>
                  <select
                    value={agent.type}
                    onChange={(e) => {
                      const newAgents = {
                        ...contract.agents,
                        [role]: { ...agent, type: e.target.value },
                      };
                      updateContract({ agents: newAgents });
                    }}
                    style={{
                      width: "100%",
                      background: "#0d0d18",
                      border: "1px solid #2a2a3a",
                      borderRadius: "6px",
                      padding: "7px 10px",
                      fontSize: "12px",
                      color: "#888898",
                      outline: "none",
                      marginTop: "6px",
                    }}
                  >
                    {ADAPTER_OPTIONS.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* Dev Brief */}
        <SectionCard title="Dev Brief">
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "#888898", marginBottom: "4px" }}>Repo Path</label>
            <input
              value={contract.devBrief.repo}
              onChange={(e) =>
                updateContract({ devBrief: { ...contract.devBrief, repo: e.target.value } })
              }
              style={{
                width: "100%",
                background: "#0d0d18",
                border: "1px solid #2a2a3a",
                borderRadius: "6px",
                padding: "8px 12px",
                fontSize: "13px",
                color: "#e0e0e8",
                outline: "none",
                fontFamily: "monospace",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "#888898", marginBottom: "6px" }}>Constraints</label>
            <EditableList
              items={contract.devBrief.constraints}
              onChange={(items) =>
                updateContract({ devBrief: { ...contract.devBrief, constraints: items } })
              }
              placeholder="Add a constraint..."
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#888898", marginBottom: "6px" }}>Definition of Done</label>
            <EditableChecklist
              items={contract.devBrief.definitionOfDone}
              onChange={(items) =>
                updateContract({ devBrief: { ...contract.devBrief, definitionOfDone: items } })
              }
              placeholder="Add a done criterion..."
            />
          </div>
        </SectionCard>

        {/* QA Brief */}
        <SectionCard title="QA Brief">
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "#888898", marginBottom: "8px" }}>QA Tier</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
              {QA_TIERS.map((tier) => {
                const selected = contract.qaBrief.tier === tier.id;
                return (
                  <button
                    key={tier.id}
                    onClick={() => {
                      updateContract({ qaBrief: { ...contract.qaBrief, tier: tier.id } });
                      recomputeCosts(generatorModel, tier.id, costEstimate?.estimatedIterations || 2);
                    }}
                    style={{
                      background: selected ? "rgba(124,58,237,0.12)" : "#0d0d18",
                      border: selected ? "2px solid #7c3aed" : "1px solid #2a2a3a",
                      borderRadius: "10px",
                      padding: "14px 12px",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s",
                      boxShadow: selected ? "0 0 12px rgba(124,58,237,0.15)" : "none",
                    }}
                  >
                    <div style={{ fontSize: "20px", marginBottom: "6px" }}>{tier.icon}</div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: selected ? "#a855f7" : "#e0e0e8", marginBottom: "4px" }}>
                      {tier.label}
                    </div>
                    <div style={{ fontSize: "11px", color: "#888898", marginBottom: "4px" }}>{tier.desc}</div>
                    <div style={{ fontSize: "10px", color: "#555565" }}>{tier.devices}</div>
                    <div style={{ fontSize: "11px", color: selected ? "#a855f7" : "#7c3aed", marginTop: "6px", fontWeight: 600 }}>
                      {tier.costRange}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "#888898", marginBottom: "4px" }}>Test URL</label>
            <input
              value={contract.qaBrief.testUrl}
              onChange={(e) =>
                updateContract({ qaBrief: { ...contract.qaBrief, testUrl: e.target.value } })
              }
              placeholder="http://localhost:3000"
              style={{
                width: "100%",
                background: "#0d0d18",
                border: "1px solid #2a2a3a",
                borderRadius: "6px",
                padding: "8px 12px",
                fontSize: "13px",
                color: "#e0e0e8",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "#888898", marginBottom: "6px" }}>Test Focus</label>
            <EditableList
              items={contract.qaBrief.testFocus}
              onChange={(items) =>
                updateContract({ qaBrief: { ...contract.qaBrief, testFocus: items } })
              }
              placeholder="Add test focus area..."
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#888898", marginBottom: "6px" }}>Pass Criteria</label>
            <EditableChecklist
              items={contract.qaBrief.passCriteria}
              onChange={(items) =>
                updateContract({ qaBrief: { ...contract.qaBrief, passCriteria: items } })
              }
              placeholder="Add pass criterion..."
            />
          </div>
        </SectionCard>

        {/* Graders */}
        <SectionCard title="Graders">
          <div style={{ fontSize: "12px", color: "#888898", marginBottom: "14px" }}>
            Select which evaluators run after each dev iteration.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {graders.map((grader) => (
              <div
                key={grader.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "14px 16px",
                  background: grader.comingSoon ? "#0a0a14" : grader.enabled ? "rgba(124,58,237,0.06)" : "#0d0d18",
                  border: `1px solid ${grader.comingSoon ? "#1e1e2e" : grader.enabled ? "rgba(124,58,237,0.3)" : "#2a2a3a"}`,
                  borderRadius: "10px",
                  opacity: grader.comingSoon ? 0.5 : 1,
                }}
              >
                {/* Toggle */}
                <div
                  onClick={() => {
                    if (grader.comingSoon) return;
                    const updated = graders.map(g =>
                      g.id === grader.id ? { ...g, enabled: !g.enabled } : g
                    );
                    setGraders(updated);
                  }}
                  style={{
                    width: "36px",
                    height: "20px",
                    borderRadius: "10px",
                    background: grader.enabled && !grader.comingSoon ? "#7c3aed" : "#2a2a3a",
                    cursor: grader.comingSoon ? "not-allowed" : "pointer",
                    position: "relative",
                    flexShrink: 0,
                    transition: "background 0.2s",
                  }}
                >
                  <div style={{
                    position: "absolute",
                    top: "3px",
                    left: grader.enabled && !grader.comingSoon ? "18px" : "3px",
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    background: "white",
                    transition: "left 0.2s",
                  }} />
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: grader.comingSoon ? "#555565" : "#e0e0e8" }}>
                      {grader.name}
                    </span>
                    {grader.comingSoon && (
                      <span style={{ fontSize: "10px", color: "#555565", background: "#1e1e2e", border: "1px solid #2a2a3a", borderRadius: "4px", padding: "1px 6px" }}>
                        coming soon
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "12px", color: "#555565" }}>
                    {grader.description} · <span style={{ color: "#7c3aed" }}>{grader.costRange}</span>
                  </div>
                </div>

                {/* Model selector */}
                {!grader.comingSoon && (
                  <select
                    value={grader.model}
                    onChange={(e) => {
                      const updated = graders.map(g =>
                        g.id === grader.id ? { ...g, model: e.target.value } : g
                      );
                      setGraders(updated);
                    }}
                    disabled={!grader.enabled}
                    style={{
                      background: "#0d0d18",
                      border: "1px solid #2a2a3a",
                      borderRadius: "6px",
                      padding: "5px 8px",
                      fontSize: "11px",
                      color: grader.enabled ? "#e0e0e8" : "#555565",
                      outline: "none",
                      cursor: grader.enabled ? "pointer" : "not-allowed",
                    }}
                  >
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Priority Trilemma */}
        <SectionCard title="Priority Trilemma">
          <div style={{ marginBottom: "12px" }}>
            {priorityOrder.map((priority, index) => {
              const medals = ["🥇", "🥈", "🥉"];
              return (
                <div
                  key={priority}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 14px",
                    background: "#0d0d18",
                    border: "1px solid #2a2a3a",
                    borderRadius: "8px",
                    marginBottom: "6px",
                  }}
                >
                  <span style={{ fontSize: "20px", width: "28px", textAlign: "center" }}>{medals[index]}</span>
                  <span style={{ flex: 1, fontSize: "14px", fontWeight: 600, color: "#e0e0e8" }}>{priority}</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <button
                      onClick={() => movePriority(index, "up")}
                      disabled={index === 0}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: index === 0 ? "default" : "pointer",
                        color: index === 0 ? "#333345" : "#888898",
                        padding: "2px",
                        display: "flex",
                      }}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => movePriority(index, "down")}
                      disabled={index === priorityOrder.length - 1}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: index === priorityOrder.length - 1 ? "default" : "pointer",
                        color: index === priorityOrder.length - 1 ? "#333345" : "#888898",
                        padding: "2px",
                        display: "flex",
                      }}
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div
            style={{
              background: "rgba(124,58,237,0.08)",
              border: "1px solid rgba(124,58,237,0.2)",
              borderRadius: "8px",
              padding: "12px 14px",
              fontSize: "13px",
              color: "#888898",
            }}
          >
            <span style={{ color: "#a855f7", fontWeight: 600 }}>This means: </span>
            {PRIORITY_DESCRIPTIONS[priorityOrder[0]]}
          </div>
        </SectionCard>

        {/* Human-in-the-Loop */}
        <SectionCard title="Human-in-the-Loop">
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "#888898", marginBottom: "8px" }}>Notify when</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {HUMAN_CHECKPOINTS.map((checkpoint) => {
                const checked = contract.human.checkpoints.includes(checkpoint);
                return (
                  <label
                    key={checkpoint}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "8px 12px",
                      background: checked ? "rgba(124,58,237,0.1)" : "#0d0d18",
                      border: checked ? "1px solid rgba(124,58,237,0.3)" : "1px solid #2a2a3a",
                      borderRadius: "7px",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const newCheckpoints = e.target.checked
                          ? [...contract.human.checkpoints, checkpoint]
                          : contract.human.checkpoints.filter((c) => c !== checkpoint);
                        updateContract({ human: { ...contract.human, checkpoints: newCheckpoints } });
                      }}
                      style={{ accentColor: "#7c3aed" }}
                    />
                    <span style={{ fontSize: "13px", color: checked ? "#e0e0e8" : "#888898" }}>
                      {checkpoint}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#888898", marginBottom: "4px" }}>Channel</label>
              <select
                value={contract.human.notificationChannel}
                onChange={(e) =>
                  updateContract({ human: { ...contract.human, notificationChannel: e.target.value } })
                }
                style={{
                  width: "100%",
                  background: "#0d0d18",
                  border: "1px solid #2a2a3a",
                  borderRadius: "6px",
                  padding: "7px 10px",
                  fontSize: "13px",
                  color: "#e0e0e8",
                  outline: "none",
                }}
              >
                <option value="telegram">Telegram</option>
                <option value="slack">Slack</option>
                <option value="email">Email</option>
                <option value="none">None</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#888898", marginBottom: "4px" }}>
                Timeout (min)
              </label>
              <input
                type="number"
                value={contract.human.responseTimeoutMinutes}
                onChange={(e) =>
                  updateContract({
                    human: { ...contract.human, responseTimeoutMinutes: parseInt(e.target.value) || 30 },
                  })
                }
                style={{
                  width: "100%",
                  background: "#0d0d18",
                  border: "1px solid #2a2a3a",
                  borderRadius: "6px",
                  padding: "7px 10px",
                  fontSize: "13px",
                  color: "#e0e0e8",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#888898", marginBottom: "4px" }}>On Timeout</label>
              <select
                value={contract.human.onTimeout}
                onChange={(e) =>
                  updateContract({ human: { ...contract.human, onTimeout: e.target.value } })
                }
                style={{
                  width: "100%",
                  background: "#0d0d18",
                  border: "1px solid #2a2a3a",
                  borderRadius: "6px",
                  padding: "7px 10px",
                  fontSize: "13px",
                  color: "#e0e0e8",
                  outline: "none",
                }}
              >
                <option value="proceed">Proceed</option>
                <option value="pause">Pause</option>
                <option value="skip">Skip</option>
              </select>
            </div>
          </div>
        </SectionCard>

        {/* Cost Estimate */}
        {costEstimate && (
          <SectionCard title="Cost Estimate">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div style={{ background: "#0d0d18", borderRadius: "8px", padding: "12px" }}>
                <div style={{ fontSize: "11px", color: "#888898", marginBottom: "4px" }}>Dev Agent</div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#e0e0e8" }}>
                  ${costEstimate.devLow.toFixed(2)}–{costEstimate.devHigh.toFixed(2)}
                </div>
              </div>
              <div style={{ background: "#0d0d18", borderRadius: "8px", padding: "12px" }}>
                <div style={{ fontSize: "11px", color: "#888898", marginBottom: "4px" }}>QA Agent</div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#e0e0e8" }}>
                  ${costEstimate.qaLow.toFixed(2)}–{costEstimate.qaHigh.toFixed(2)}
                </div>
              </div>
              <div style={{ background: "#0d0d18", borderRadius: "8px", padding: "12px" }}>
                <div style={{ fontSize: "11px", color: "#888898", marginBottom: "4px" }}>Est. Iterations</div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#e0e0e8" }}>
                  {costEstimate.estimatedIterations}
                </div>
              </div>
            </div>
            <div
              style={{
                background: "rgba(124,58,237,0.08)",
                border: "1px solid rgba(124,58,237,0.2)",
                borderRadius: "8px",
                padding: "12px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <span style={{ fontSize: "13px", color: "#888898" }}>Total Estimate</span>
              <span style={{ fontSize: "20px", fontWeight: 700, color: "#a855f7" }}>
                ${costEstimate.totalLow.toFixed(2)}–${costEstimate.totalHigh.toFixed(2)}
              </span>
            </div>
            {/* Visual bar */}
            <div style={{ background: "#0d0d18", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${Math.min((costEstimate.totalHigh / 10) * 100, 100)}%`,
                  background: "linear-gradient(90deg, #22c55e, #f59e0b, #ef4444)",
                  borderRadius: "4px",
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#555565", marginTop: "4px" }}>
              <span>$0</span>
              <span>$10 budget</span>
            </div>
          </SectionCard>
        )}

        {/* Continue button */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
          <button
            onClick={() => {
              setStep(3);
              saveToStorage({ step: 3 });
            }}
            style={{
              padding: "11px 24px",
              background: "linear-gradient(135deg, #7c3aed, #a855f7)",
              border: "none",
              borderRadius: "8px",
              color: "white",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            Continue to Actions
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  };

  // ─── Step 3: Actions ────────────────────────────────────────────────────────

  const renderStep3 = () => {
    if (!contract) return null;
    return (
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>
        <div style={{ marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={() => setStep(2)}
            style={{
              background: "none",
              border: "1px solid #2a2a3a",
              borderRadius: "8px",
              padding: "6px 12px",
              color: "#888898",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "13px",
            }}
          >
            <ArrowLeft size={14} /> Back to Edit
          </button>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "#e0e0e8" }}>
            Launch Sprint
          </h1>
        </div>

        {/* Summary card */}
        <div
          style={{
            background: "#141420",
            border: "1px solid #2a2a3a",
            borderRadius: "12px",
            padding: "20px 24px",
            marginBottom: "16px",
          }}
        >
          <div style={{ fontSize: "11px", color: "#555565", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>
            Contract Summary
          </div>
          <div style={{ fontSize: "16px", fontWeight: 600, color: "#e0e0e8", marginBottom: "6px" }}>
            {contract.name}
          </div>
          <div style={{ fontSize: "13px", color: "#888898", marginBottom: "12px", lineHeight: 1.5 }}>
            {contract.task.slice(0, 120)}{contract.task.length > 120 ? "..." : ""}
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: "5px", padding: "2px 8px", color: "#a855f7" }}>
              {contract.qaBrief.tier} QA
            </span>
            <span style={{ fontSize: "11px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "5px", padding: "2px 8px", color: "#22c55e" }}>
              {contract.agents.generator.model.replace("claude-", "").replace("-", " ")}
            </span>
            {costEstimate && (
              <span style={{ fontSize: "11px", background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: "5px", padding: "2px 8px", color: "#a855f7" }}>
                ${costEstimate.totalLow.toFixed(2)}–${costEstimate.totalHigh.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Run Now */}
          <button
            onClick={() => handleSave("approved")}
            disabled={saving}
            style={{
              padding: "16px 24px",
              background: saving ? "#2a2a3a" : "linear-gradient(135deg, #7c3aed, #a855f7)",
              border: "none",
              borderRadius: "10px",
              color: saving ? "#555565" : "white",
              fontSize: "15px",
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              transition: "all 0.15s",
            }}
          >
            <Rocket size={18} />
            Run Now
            <span style={{ fontSize: "12px", opacity: 0.75, fontWeight: 400 }}>
              — queue &amp; go live
            </span>
          </button>

          {/* Schedule */}
          <div
            style={{
              background: "#141420",
              border: "1px solid #2a2a3a",
              borderRadius: "10px",
              padding: "16px 20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <Clock size={16} color="#888898" />
              <span style={{ fontSize: "14px", fontWeight: 500, color: "#e0e0e8" }}>Schedule</span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                style={{
                  flex: 1,
                  background: "#0d0d18",
                  border: "1px solid #2a2a3a",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  fontSize: "13px",
                  color: "#e0e0e8",
                  outline: "none",
                  colorScheme: "dark",
                }}
              />
              <button
                onClick={() =>
                  scheduledFor && handleSave("scheduled", new Date(scheduledFor).toISOString())
                }
                disabled={!scheduledFor || saving}
                style={{
                  padding: "8px 16px",
                  background: scheduledFor ? "rgba(124,58,237,0.15)" : "#1a1a2a",
                  border: scheduledFor ? "1px solid rgba(124,58,237,0.4)" : "1px solid #2a2a3a",
                  borderRadius: "6px",
                  color: scheduledFor ? "#a855f7" : "#555565",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: scheduledFor && !saving ? "pointer" : "not-allowed",
                  whiteSpace: "nowrap",
                }}
              >
                Set Schedule
              </button>
            </div>
          </div>

          {/* Save as Draft */}
          <button
            onClick={() => handleSave("draft")}
            disabled={saving}
            style={{
              padding: "14px 24px",
              background: "transparent",
              border: "1px solid #2a2a3a",
              borderRadius: "10px",
              color: "#888898",
              fontSize: "14px",
              fontWeight: 500,
              cursor: saving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.15s",
            }}
          >
            <Save size={16} />
            Save as Draft
          </button>
        </div>

        {/* Feedback message */}
        {saveMsg && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 16px",
              background: saveMsg.includes("failed")
                ? "rgba(239,68,68,0.1)"
                : "rgba(34,197,94,0.1)",
              border: `1px solid ${saveMsg.includes("failed") ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
              borderRadius: "8px",
              fontSize: "13px",
              color: saveMsg.includes("failed") ? "#ef4444" : "#22c55e",
              textAlign: "center",
            }}
          >
            {saveMsg}
          </div>
        )}
      </div>
    );
  };

  // ─── Step indicator ──────────────────────────────────────────────────────────

  const steps = [
    { num: 1, label: "Input" },
    { num: 2, label: "Review" },
    { num: 3, label: "Launch" },
  ];

  return (
    <div style={{ padding: "32px", minHeight: "100vh" }}>
      {/* Step indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "32px",
          maxWidth: "760px",
          margin: "0 auto 32px",
        }}
      >
        {steps.map((s, i) => {
          const active = step === s.num;
          const done = step > s.num;
          return (
            <div key={s.num} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 12px",
                  borderRadius: "20px",
                  background: active
                    ? "rgba(124,58,237,0.15)"
                    : done
                    ? "rgba(34,197,94,0.1)"
                    : "transparent",
                  border: `1px solid ${active ? "#7c3aed" : done ? "rgba(34,197,94,0.3)" : "#2a2a3a"}`,
                }}
              >
                <span
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    background: active ? "#7c3aed" : done ? "#22c55e" : "#2a2a3a",
                    color: "white",
                    fontSize: "10px",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {done ? "✓" : s.num}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: active ? 600 : 400,
                    color: active ? "#a855f7" : done ? "#22c55e" : "#888898",
                  }}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  style={{
                    width: "24px",
                    height: "1px",
                    background: step > s.num ? "rgba(34,197,94,0.4)" : "#2a2a3a",
                  }}
                />
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
