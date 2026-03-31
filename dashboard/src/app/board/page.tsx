"use client";

import React from "react";
import Link from "next/link";
import { useState, useCallback } from "react";
import { usePolling } from "@/hooks/usePolling";
import { Plus, Edit2, Trash2, Play, Calendar, Handshake, Wand2, Loader2, X } from "lucide-react";
import Toast from "@/components/Toast";
import { getGeneratorAgents } from "@/lib/agents";
import type { SprintSummary, Project } from "@/types/mah";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getProjectAccent(projectId?: string | null): string {
  if (projectId === "w-construction") return "#eab308";
  if (projectId === "mah-build") return "#fb923c";
  if (!projectId) return "#555565";
  const hash = projectId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return `hsl(${hash % 360}, 70%, 65%)`;
}

function formatCost(cost: number): string {
  if (cost === 0) return "—";
  return `$${cost.toFixed(2)}`;
}

function formatDuration(start?: string | null, end?: string | null): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "<1m";
  return `${mins}m`;
}

function nextActionForSprint(sprint: SprintSummary): string {
  switch (sprint.status) {
    case "draft": return "Awaiting approval";
    case "planned": return "Planned — pending scheduling";
    case "approved": return "Approved — ready to run";
    case "queued": return "Queued — waiting to start";
    case "running": return "Running now…";
    case "passed": return "Ready for human review";
    case "failed": return "Review defects & re-run";
    default: return sprint.status;
  }
}

// ─── Column Config ────────────────────────────────────────────────────────────

interface ColumnConfig {
  status: string;
  label: string;
  color: string;
  bg: string;
}

const COLUMNS: ColumnConfig[] = [
  { status: "draft",    label: "Draft",    color: "#9ca3af", bg: "rgba(136,136,152,0.06)" },
  { status: "planned",  label: "Planned",  color: "#3b82f6", bg: "rgba(59,130,246,0.06)"  },
  { status: "approved", label: "Approved", color: "#eab308", bg: "rgba(245,158,11,0.06)"  },
  { status: "queued",   label: "Queued",   color: "#3b82f6", bg: "rgba(59,130,246,0.06)"  },
  { status: "running",  label: "Running",  color: "#fb923c", bg: "rgba(20,184,166,0.06)"  },
  { status: "passed",   label: "Passed",   color: "#22c55e", bg: "rgba(34,197,94,0.06)"   },
  { status: "failed",   label: "Failed",   color: "#ef4444", bg: "rgba(239,68,68,0.06)"   },
];

// ─── Sprint Card ──────────────────────────────────────────────────────────────

interface SprintCardProps {
  sprint: SprintSummary;
  projects: Project[];
  onAction: (action: string, sprintId: string) => void;
  onEdit: (sprintId: string, name: string, task: string) => void;
  isLoading: boolean;
}

function SprintCard({ sprint, projects, onAction, onEdit, isLoading }: SprintCardProps) {
  const accent = getProjectAccent(sprint.projectId);
  const project = projects.find((p) => p.id === sprint.projectId);
  const isRunning = sprint.status === "running";
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(sprint.name);
  const [editTask, setEditTask] = useState(sprint.task || sprint.name);

  // Determine which actions to show based on status
  const showPlan = sprint.status === "draft" && !isEditing;
  const showEdit = sprint.status === "draft" && !isEditing;
  const showDelete = sprint.status === "draft" && !isEditing;
  const showNegotiate = sprint.status === "planned";
  const showOpenInBuilder = sprint.status === "planned";
  const showRun = sprint.status === "approved";
  const showSchedule = sprint.status === "approved";

  const hasActions = showPlan || showEdit || showDelete || showNegotiate || showOpenInBuilder || showRun || showSchedule;

  const handleEditSubmit = () => {
    if (!editName.trim() || !editTask.trim()) return;
    onEdit(sprint.id, editName, editTask);
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setEditName(sprint.name);
    setEditTask(sprint.task || sprint.name);
    setIsEditing(false);
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: "#0f1116",
        border: "1px solid #1c1d26",
        borderRadius: "10px",
        padding: "12px 14px",
        marginBottom: "8px",
        transition: "border-color 0.15s, box-shadow 0.15s",
        position: "relative",
        overflow: "hidden",
      }}
      className="kanban-card"
    >
      {/* Loading overlay */}
      {isLoading && (
        <div style={{
          position: "absolute",
          inset: 0,
          background: "rgba(15, 17, 22, 0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "10px",
          zIndex: 10,
        }}>
          <Loader2 size={20} color="#fb923c" className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />
        </div>
      )}

      {/* Running pulse strip */}
      {isRunning && (
        <div style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "3px",
          background: "#fb923c",
          borderRadius: "10px 0 0 10px",
        }} />
      )}

      {/* Sprint name / Edit form */}
      {isEditing ? (
        <div style={{ marginBottom: "8px" }}>
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            maxLength={60}
            autoFocus
            style={{
              width: "100%",
              background: "#14151b",
              border: "1px solid #3b82f640",
              borderRadius: "6px",
              padding: "6px 8px",
              fontSize: "12px",
              color: "#e0e0e8",
              outline: "none",
              marginBottom: "6px",
            }}
            placeholder="Sprint name"
          />
          <textarea
            value={editTask}
            onChange={(e) => setEditTask(e.target.value)}
            rows={2}
            style={{
              width: "100%",
              background: "#14151b",
              border: "1px solid #3b82f640",
              borderRadius: "6px",
              padding: "6px 8px",
              fontSize: "11px",
              color: "#e0e0e8",
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
              marginBottom: "6px",
            }}
            placeholder="Task description"
          />
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              onClick={handleEditSubmit}
              disabled={!editName.trim() || !editTask.trim()}
              style={{
                flex: 1,
                background: "#22c55e20",
                border: "1px solid #22c55e40",
                color: "#22c55e",
                padding: "4px 8px",
                borderRadius: "5px",
                fontSize: "10px",
                fontWeight: 500,
                cursor: editName.trim() && editTask.trim() ? "pointer" : "not-allowed",
                opacity: editName.trim() && editTask.trim() ? 1 : 0.5,
              }}
            >
              Save
            </button>
            <button
              onClick={handleEditCancel}
              style={{
                background: "#ef444420",
                border: "1px solid #ef444440",
                color: "#ef4444",
                padding: "4px 8px",
                borderRadius: "5px",
                fontSize: "10px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      ) : (
        <Link
          href={`/sprints/${sprint.id}`}
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "#e0e0e8",
            marginBottom: "8px",
            lineHeight: 1.4,
            paddingLeft: isRunning ? "6px" : "0",
            textDecoration: "none",
            display: "block",
          }}
        >
          #{sprint.id} {sprint.name}
        </Link>
      )}

      {/* Agent badge (if assigned) */}
      {sprint.agentConfig?.generator && (
        <div style={{ marginBottom: "8px" }}>
          <span style={{
            fontSize: "10px",
            color: "#10b981",
            background: "#10b98120",
            border: "1px solid #10b98140",
            borderRadius: "4px",
            padding: "2px 6px",
            fontWeight: 500,
          }}>
            {sprint.agentConfig.generator.agentName}
          </span>
        </div>
      )}

      {/* Project badge */}
      {sprint.projectId && (
        <div style={{ marginBottom: "8px" }}>
          <span style={{
            fontSize: "10px",
            color: accent,
            background: `${accent}18`,
            border: `1px solid ${accent}40`,
            borderRadius: "4px",
            padding: "2px 6px",
            fontWeight: 500,
          }}>
            {project?.name || sprint.projectId}
          </span>
        </div>
      )}

      {/* Stats row */}
      <div style={{
        display: "flex",
        gap: "12px",
        marginBottom: "8px",
        flexWrap: "wrap",
      }}>
        <span style={{ fontSize: "11px", color: "#fb923c" }}>
          {formatCost(sprint.totalCost)}
        </span>
        <span style={{ fontSize: "11px", color: "#555565" }}>
          ⏱ {formatDuration(sprint.createdAt, sprint.completedAt)}
        </span>
        {sprint.iterations > 0 && (
          <span style={{ fontSize: "11px", color: "#555565" }}>
            {sprint.iterations} iter
          </span>
        )}
      </div>

      {/* Next action */}
      <div style={{
        fontSize: "11px",
        color: "#9ca3af",
        background: "#0d0d18",
        borderRadius: "5px",
        padding: "4px 8px",
        lineHeight: 1.4,
        marginBottom: hasActions ? "8px" : "0",
      }}>
        → {nextActionForSprint(sprint)}
      </div>

      {/* Action buttons (always visible on mobile, hover on desktop) */}
      {hasActions && (
        <div
          className="card-actions"
          style={{
            display: "flex",
            gap: "6px",
            marginTop: "8px",
            opacity: isHovered ? 1 : 0,
            transition: "opacity 0.2s ease",
            pointerEvents: isHovered ? "auto" : "none",
          }}>
          {showPlan && (
            <button
              onClick={(e) => { e.stopPropagation(); onAction("plan", sprint.id); }}
              disabled={isLoading}
              style={{
                background: "#3b82f620",
                border: "1px solid #3b82f640",
                color: "#3b82f6",
                padding: "4px 8px",
                borderRadius: "5px",
                fontSize: "10px",
                fontWeight: 500,
                cursor: isLoading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = "#3b82f630")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#3b82f620")}
            >
              <Wand2 size={12} />
              <span>Plan</span>
            </button>
          )}
          {showEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
              disabled={isLoading}
              style={{
                background: "#9ca3af20",
                border: "1px solid #9ca3af40",
                color: "#9ca3af",
                padding: "4px 8px",
                borderRadius: "5px",
                fontSize: "10px",
                fontWeight: 500,
                cursor: isLoading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = "#9ca3af30")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#9ca3af20")}
            >
              <Edit2 size={12} />
              <span>Edit</span>
            </button>
          )}
          {showDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onAction("delete", sprint.id); }}
              disabled={isLoading}
              style={{
                background: "#ef444420",
                border: "1px solid #ef444440",
                color: "#ef4444",
                padding: "4px 8px",
                borderRadius: "5px",
                fontSize: "10px",
                fontWeight: 500,
                cursor: isLoading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = "#ef444430")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#ef444420")}
            >
              <Trash2 size={12} />
              <span>Delete</span>
            </button>
          )}
          {showNegotiate && (
            <button
              onClick={(e) => { e.stopPropagation(); onAction("negotiate", sprint.id); }}
              disabled={isLoading}
              style={{
                background: "#eab30820",
                border: "1px solid #eab30840",
                color: "#eab308",
                padding: "4px 8px",
                borderRadius: "5px",
                fontSize: "10px",
                fontWeight: 500,
                cursor: isLoading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = "#eab30830")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#eab30820")}
            >
              <Handshake size={12} />
              <span>Negotiate</span>
            </button>
          )}
          {showOpenInBuilder && (
            <Link
              href={`/builder?sprintId=${sprint.id}`}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#3b82f620",
                border: "1px solid #3b82f640",
                color: "#3b82f6",
                padding: "4px 8px",
                borderRadius: "5px",
                fontSize: "10px",
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                transition: "all 0.15s",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#3b82f630")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#3b82f620")}
            >
              <Wand2 size={12} />
              <span>Open in Builder</span>
            </Link>
          )}
          {showRun && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onAction("run", sprint.id); }}
                disabled={isLoading}
                style={{
                  background: "#22c55e20",
                  border: "1px solid #22c55e40",
                  color: "#22c55e",
                  padding: "4px 8px",
                  borderRadius: "5px",
                  fontSize: "10px",
                  fontWeight: 500,
                  cursor: isLoading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = "#22c55e30")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#22c55e20")}
              >
                <Play size={12} />
                <span>Run</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onAction("schedule", sprint.id); }}
                disabled={isLoading}
                style={{
                  background: "#9ca3af20",
                  border: "1px solid #9ca3af40",
                  color: "#9ca3af",
                  padding: "4px 8px",
                  borderRadius: "5px",
                  fontSize: "10px",
                  fontWeight: 500,
                  cursor: isLoading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = "#9ca3af30")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#9ca3af20")}
              >
                <Calendar size={12} />
                <span>Schedule</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Board Column ─────────────────────────────────────────────────────────────

interface BoardColumnProps {
  col: ColumnConfig;
  sprints: SprintSummary[];
  projects: Project[];
  onAction: (action: string, sprintId: string) => void;
  onEdit: (sprintId: string, name: string, task: string) => void;
  loadingSprintId: string | null;
  showNewCardForm: boolean;
  onNewCardClick: () => void;
  onNewCardSubmit: (name: string, task: string, projectId: string) => void;
  onNewCardCancel: () => void;
}

function BoardColumn({ col, sprints, projects, onAction, onEdit, loadingSprintId, showNewCardForm, onNewCardClick, onNewCardSubmit, onNewCardCancel }: BoardColumnProps) {
  const isDraftColumn = col.status === "draft";

  return (
    <div style={{
      minWidth: "220px",
      flex: "1 1 220px",
      maxWidth: "300px",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Column header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 12px",
        background: col.bg,
        border: `1px solid ${col.color}30`,
        borderRadius: "10px 10px 0 0",
        borderBottom: "none",
        marginBottom: "0",
      }}>
        <div style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: col.color,
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: "12px",
          fontWeight: 700,
          color: col.color,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}>
          {col.label}
        </span>
        <span style={{
          marginLeft: "auto",
          fontSize: "11px",
          fontWeight: 700,
          color: sprints.length > 0 ? col.color : "#555565",
          background: sprints.length > 0 ? `${col.color}20` : "#1a1a2a",
          border: `1px solid ${sprints.length > 0 ? col.color + "40" : "#1c1d26"}`,
          borderRadius: "10px",
          padding: "1px 7px",
          minWidth: "20px",
          textAlign: "center",
        }}>
          {sprints.length}
        </span>
      </div>

      {/* Cards area */}
      <div style={{
        flex: 1,
        padding: "10px",
        background: col.bg,
        border: `1px solid ${col.color}20`,
        borderTop: "none",
        borderRadius: "0 0 10px 10px",
        minHeight: "120px",
      }}>
        {/* New Card form/button (Draft column only) */}
        {isDraftColumn && (
          showNewCardForm ? (
            <NewCardForm
              projects={projects}
              onSubmit={onNewCardSubmit}
              onCancel={onNewCardCancel}
            />
          ) : (
            <button
              onClick={onNewCardClick}
              style={{
                width: "100%",
                background: "#0f1116",
                border: "1px dashed #9ca3af40",
                borderRadius: "10px",
                padding: "12px",
                marginBottom: "8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                color: "#9ca3af",
                fontSize: "12px",
                fontWeight: 500,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#9ca3af80";
                e.currentTarget.style.background = "#14151b";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#9ca3af40";
                e.currentTarget.style.background = "#0f1116";
              }}
            >
              <Plus size={14} />
              <span>New Card</span>
            </button>
          )
        )}

        {/* Sprint cards */}
        {sprints.length === 0 && !isDraftColumn ? (
          <div style={{
            textAlign: "center",
            padding: "20px 12px",
            fontSize: "12px",
            color: "#333345",
            fontStyle: "italic",
          }}>
            No sprints
          </div>
        ) : (
          sprints.map((s) => (
            <SprintCard
              key={s.id}
              sprint={s}
              projects={projects}
              onAction={onAction}
              onEdit={onEdit}
              isLoading={loadingSprintId === s.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── New Card Form ────────────────────────────────────────────────────────────

interface NewCardFormProps {
  projects: Project[];
  onSubmit: (name: string, task: string, projectId: string) => void;
  onCancel: () => void;
}

function NewCardForm({ projects, onSubmit, onCancel }: NewCardFormProps) {
  const [name, setName] = useState("");
  const [task, setTask] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !task.trim()) return;
    onSubmit(name, task, projectId);
  };

  return (
    <div style={{
      background: "#0f1116",
      border: "1px solid #3b82f640",
      borderRadius: "10px",
      padding: "12px",
      marginBottom: "8px",
    }}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "8px" }}>
          <input
            type="text"
            placeholder="Sprint name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
            style={{
              width: "100%",
              background: "#14151b",
              border: "1px solid #1c1d26",
              borderRadius: "6px",
              padding: "6px 8px",
              fontSize: "12px",
              color: "#e0e0e8",
              outline: "none",
            }}
          />
        </div>
        <div style={{ marginBottom: "8px" }}>
          <textarea
            placeholder="Task description"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              background: "#14151b",
              border: "1px solid #1c1d26",
              borderRadius: "6px",
              padding: "6px 8px",
              fontSize: "11px",
              color: "#e0e0e8",
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        </div>
        {projects.length > 0 && (
          <div style={{ marginBottom: "10px" }}>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              style={{
                width: "100%",
                background: "#14151b",
                border: "1px solid #1c1d26",
                borderRadius: "6px",
                padding: "6px 8px",
                fontSize: "11px",
                color: "#e0e0e8",
                outline: "none",
                cursor: "pointer",
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            type="submit"
            disabled={!name.trim() || !task.trim()}
            style={{
              flex: 1,
              background: "#3b82f620",
              border: "1px solid #3b82f640",
              color: "#3b82f6",
              padding: "6px 10px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: 500,
              cursor: name.trim() && task.trim() ? "pointer" : "not-allowed",
              opacity: name.trim() && task.trim() ? 1 : 0.5,
            }}
          >
            Create
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: "#ef444420",
              border: "1px solid #ef444440",
              color: "#ef4444",
              padding: "6px 10px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BoardPage() {
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [showNewCardForm, setShowNewCardForm] = useState(false);
  const [loadingSprintId, setLoadingSprintId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const { data: sprints, refetch } = usePolling<SprintSummary[]>("/api/sprints", 8000);
  const { data: projects } = usePolling<Project[]>("/api/projects", 30000);

  const allSprints = sprints || [];
  const allProjects = projects || [];

  const filtered = projectFilter === "all"
    ? allSprints
    : allSprints.filter((s) => (s.projectId || null) === (projectFilter === "none" ? null : projectFilter));

  // ─── Action Handlers ─────────────────────────────────────────────────────────

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
  }, []);

  const handleCreateCard = useCallback(async (name: string, task: string, projectId: string) => {
    try {
      const response = await fetch("/api/board/create-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, task, projectId }),
      });

      if (!response.ok) throw new Error("Failed to create card");

      setShowNewCardForm(false);
      showToast("Card created successfully");
      refetch();
    } catch (err) {
      console.error("Create card error:", err);
      showToast("Failed to create card", "error");
    }
  }, [refetch, showToast]);

  const handlePlanSprint = useCallback(async (sprintId: string) => {
    setLoadingSprintId(sprintId);
    try {
      const response = await fetch("/api/board/plan-sprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId }),
      });

      if (!response.ok) throw new Error("Planning failed");

      const result = await response.json();

      if (!result.success) throw new Error(result.error || "Planning failed");

      showToast("Sprint planned successfully");
      refetch();
    } catch (err) {
      console.error("Plan error:", err);
      showToast("Failed to plan sprint", "error");
    } finally {
      setLoadingSprintId(null);
    }
  }, [refetch, showToast]);

  const handleNegotiate = useCallback(async (sprintId: string) => {
    setLoadingSprintId(sprintId);
    try {
      const sprint = allSprints.find((s) => s.id === sprintId);
      if (!sprint || !sprint.agentConfig) throw new Error("Sprint not found or missing agent config");

      // Fetch full contract
      const contractResponse = await fetch(`/api/sprints/${sprintId}`);
      if (!contractResponse.ok) {
        const errData = await contractResponse.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to fetch contract");
      }
      const { contract } = await contractResponse.json();

      // Call negotiate API
      const negotiateResponse = await fetch("/api/builder/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sprint: {
            name: sprint.name,
            task: contract.task || sprint.name,
            sprintType: contract.sprintType,
            agent: { id: sprint.agentConfig.generator.agentId, name: sprint.agentConfig.generator.agentName },
            evaluator: { id: sprint.agentConfig.evaluator.agentId, name: sprint.agentConfig.evaluator.agentName },
            suggestedQaTier: contract.qaBrief?.tier,
            estimatedComplexity: contract.estimatedComplexity || "medium",
          },
          projectId: sprint.projectId,
        }),
      });

      if (!negotiateResponse.ok) {
        const errData = await negotiateResponse.json().catch(() => ({}));
        throw new Error(errData.error || "Negotiation failed");
      }

      const { negotiated, generatorBrief, evaluatorBrief, errors } = await negotiateResponse.json();

      // Log any errors during negotiation (non-fatal)
      if (errors?.generator) {
        console.warn("Generator negotiation had issues:", errors.generator);
      }
      if (errors?.evaluator) {
        console.warn("Evaluator negotiation had issues:", errors.evaluator);
      }

      // Save negotiated contract with approved status
      const updatedContract = {
        ...contract,
        status: "approved",
        devBrief: negotiated.devBrief,
        qaBrief: negotiated.qaBrief,
        generatorBrief,
        evaluatorBrief,
      };

      const saveResponse = await fetch("/api/builder/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contract: updatedContract }),
      });

      if (!saveResponse.ok) {
        const errData = await saveResponse.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save negotiated contract");
      }

      showToast("Contract negotiated successfully");
      refetch();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Negotiate error:", errMsg);
      showToast(`Negotiation failed: ${errMsg}`, "error");
    } finally {
      setLoadingSprintId(null);
    }
  }, [allSprints, refetch, showToast]);

  const handleRunSprint = useCallback(async (sprintId: string) => {
    setLoadingSprintId(sprintId);
    try {
      const response = await fetch("/api/sprints/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId: sprintId }),
      });

      if (!response.ok) throw new Error("Failed to run sprint");

      const result = await response.json();
      showToast(result.message || "Sprint started successfully");
      refetch();
    } catch (err) {
      console.error("Run error:", err);
      showToast("Failed to run sprint", "error");
    } finally {
      setLoadingSprintId(null);
    }
  }, [refetch, showToast]);

  const handleScheduleSprint = useCallback(async (sprintId: string) => {
    const dateStr = prompt("Schedule for (YYYY-MM-DD HH:MM):");
    if (!dateStr) return;

    setLoadingSprintId(sprintId);
    try {
      const scheduledFor = new Date(dateStr).toISOString();

      const response = await fetch("/api/sprints/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId: sprintId, enqueue: true }),
      });

      if (!response.ok) throw new Error("Failed to schedule sprint");

      showToast("Sprint scheduled successfully");
      refetch();
    } catch (err) {
      console.error("Schedule error:", err);
      showToast("Failed to schedule sprint", "error");
    } finally {
      setLoadingSprintId(null);
    }
  }, [refetch, showToast]);

  const handleEditSprint = useCallback(async (sprintId: string, name: string, task: string) => {
    setLoadingSprintId(sprintId);
    try {
      const response = await fetch("/api/board/update-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sprintId,
          updates: { name, task },
        }),
      });

      if (!response.ok) throw new Error("Failed to update sprint");

      showToast("Sprint updated successfully");
      refetch();
    } catch (err) {
      console.error("Edit error:", err);
      showToast("Failed to update sprint", "error");
    } finally {
      setLoadingSprintId(null);
    }
  }, [refetch, showToast]);

  const handleDeleteSprint = useCallback(async (sprintId: string) => {
    if (!confirm("Delete this draft sprint?")) return;

    setLoadingSprintId(sprintId);
    try {
      const response = await fetch(`/api/board/draft/${sprintId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete sprint");

      showToast("Sprint deleted successfully");
      refetch();
    } catch (err) {
      console.error("Delete error:", err);
      showToast("Failed to delete sprint", "error");
    } finally {
      setLoadingSprintId(null);
    }
  }, [refetch, showToast]);

  const handleAction = useCallback((action: string, sprintId: string) => {
    switch (action) {
      case "plan": return handlePlanSprint(sprintId);
      case "negotiate": return handleNegotiate(sprintId);
      case "run": return handleRunSprint(sprintId);
      case "schedule": return handleScheduleSprint(sprintId);
      case "delete": return handleDeleteSprint(sprintId);
    }
  }, [handlePlanSprint, handleNegotiate, handleRunSprint, handleScheduleSprint, handleDeleteSprint]);

  return (
    <div style={{ padding: "32px", minWidth: 0 }}>
      {/* Page header */}
      <div style={{
        marginBottom: "24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: "16px",
        flexWrap: "wrap",
      }}>
        <div>
          <h1 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 700, color: "#e0e0e8" }}>
            Board
          </h1>
          <div style={{ fontSize: "13px", color: "#9ca3af" }}>
            {filtered.length} sprint{filtered.length !== 1 ? "s" : ""}
            {projectFilter !== "all" && " (filtered)"}
          </div>
        </div>

        {/* Project filter */}
        {allProjects.length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={() => setProjectFilter("all")}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid",
                borderColor: projectFilter === "all" ? "#fb923c" : "#1c1d26",
                background: projectFilter === "all" ? "rgba(20,184,166,0.15)" : "transparent",
                color: projectFilter === "all" ? "#fb923c" : "#9ca3af",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              All
            </button>
            {allProjects.map((project) => {
              const accent = getProjectAccent(project.id);
              const active = projectFilter === project.id;
              return (
                <button
                  key={project.id}
                  onClick={() => setProjectFilter(active ? "all" : project.id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid",
                    borderColor: active ? accent : "#1c1d26",
                    background: active ? `${accent}18` : "transparent",
                    color: active ? accent : "#9ca3af",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {project.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Kanban columns */}
      <div style={{
        display: "flex",
        gap: "12px",
        overflowX: "auto",
        paddingBottom: "16px",
        alignItems: "flex-start",
      }}>
        {COLUMNS.map((col) => {
          const colSprints = filtered.filter((s) => {
            // Map running-adjacent statuses into the running column (but NOT queued, which has its own column now)
            if (col.status === "running") return s.status === "running" || s.status === "dev" || s.status === "qa";
            if (col.status === "queued") return s.status === "queued";
            return s.status === col.status;
          });
          return (
            <BoardColumn
              key={col.status}
              col={col}
              sprints={colSprints}
              projects={allProjects}
              onAction={handleAction}
              onEdit={handleEditSprint}
              loadingSprintId={loadingSprintId}
              showNewCardForm={showNewCardForm}
              onNewCardClick={() => setShowNewCardForm(true)}
              onNewCardSubmit={handleCreateCard}
              onNewCardCancel={() => setShowNewCardForm(false)}
            />
          );
        })}
      </div>

      {/* Toast notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <style>{`
        .kanban-card,
        .kanban-card * {
          box-sizing: border-box;
        }
        .kanban-card:hover {
          border-color: #3a3a4a !important;
          box-shadow: 0 2px 12px rgba(0,0,0,0.3);
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        /* Mobile: always show action buttons */
        @media (max-width: 768px) {
          .card-actions {
            opacity: 1 !important;
            pointer-events: auto !important;
          }
        }
        /* Touch devices: always show action buttons */
        @media (hover: none) and (pointer: coarse) {
          .card-actions {
            opacity: 1 !important;
            pointer-events: auto !important;
          }
        }
      `}</style>
    </div>
  );
}
