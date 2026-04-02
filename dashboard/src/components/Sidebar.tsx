"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, List, Radio, Zap, Menu, X, FolderKanban, PlusSquare, Kanban, Settings } from "lucide-react";
import { useState } from "react";
import ActiveSprint from "@/components/ActiveSprint";
import { usePolling } from "@/hooks/usePolling";
import type { MahConfig, Project } from "@/types/mah";

interface Stats {
  totalCost: number;
}

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/projects", icon: FolderKanban, label: "Projects" },
  { href: "/sprints", icon: List, label: "Sprints" },
  { href: "/board", icon: Kanban, label: "Board" },
  { href: "/live", icon: Radio, label: "Live" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

function SidebarContent({ pathname, onClose }: { pathname: string; onClose?: () => void }) {
  const { data: config } = usePolling<MahConfig>("/api/config", 60000);
  const { data: stats } = usePolling<Stats>("/api/stats", 15000);
  const { data: projects } = usePolling<Project[]>("/api/projects", 30000);
  const { data: drafts } = usePolling<unknown[]>("/api/builder/drafts", 15000);
  const { data: allSprints } = usePolling<{ status: string }[]>("/api/sprints", 8000);
  const draftCount = (drafts || []).length;
  const runningCount = (allSprints || []).filter((s) => s.status === "running").length;
  const queuedCount = (allSprints || []).filter((s) => s.status === "queued").length;
  const isLive = runningCount > 0;

  return (
    <>
      {/* Logo */}
      <div
        style={{
          padding: "24px 20px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #fb923c, #f97316)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 2px 8px rgba(251, 146, 60, 0.25)",
            }}
          >
            <Zap size={14} color="white" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "14px", color: "#e0e0e8", letterSpacing: "0.05em" }}>MAH</div>
            <div style={{ fontSize: "11px", color: "#9ca3af" }}>
              {config?.project?.name || "Multi-Agent Harness"}
            </div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: "4px" }}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ padding: "12px 10px", flex: 1 }}>
        {/* Builder — primary action */}
        <Link
          href="/builder"
          onClick={onClose}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 14px",
            borderRadius: "8px",
            marginBottom: "10px",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
            color: pathname.startsWith("/builder") ? "white" : "#e6e8f0",
            background: pathname.startsWith("/builder")
              ? "linear-gradient(135deg, #fb923c, #10b981)"
              : "rgba(251, 146, 60, 0.12)",
            border: pathname.startsWith("/builder")
              ? "1px solid rgba(251, 146, 60, 0.4)"
              : "1px solid rgba(251, 146, 60, 0.25)",
            transition: "all 0.2s ease",
            position: "relative",
            boxShadow: pathname.startsWith("/builder") ? "0 2px 8px rgba(251, 146, 60, 0.25)" : "none",
          }}
          className="nav-link"
        >
          <PlusSquare size={16} strokeWidth={2.5} color={pathname.startsWith("/builder") ? "white" : "#fb923c"} />
          Builder
          {draftCount > 0 && (
            <span
              style={{
                marginLeft: "auto",
                background: "#fb923c",
                color: "white",
                fontSize: "10px",
                fontWeight: 700,
                borderRadius: "10px",
                padding: "2px 7px",
                minWidth: "18px",
                textAlign: "center",
              }}
            >
              {draftCount}
            </span>
          )}
        </Link>

        {navItems.map(({ href, icon: Icon, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const isLiveItem = href === "/live";
          const isSprintsItem = href === "/sprints";
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 12px",
                borderRadius: "8px",
                marginBottom: "2px",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: active ? 600 : 400,
                color: active ? "#e6e8f0" : "#9ca3af",
                background: active ? "rgba(251, 146, 60, 0.12)" : "transparent",
                transition: "all 0.2s ease",
              }}
              className="nav-link"
            >
              <Icon size={16} strokeWidth={active ? 2 : 1.5} color={active ? "#fb923c" : "#9ca3af"} />
              {label}
              {isLiveItem && isLive && (
                <div
                  className="dot-pulse"
                  style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fb923c", marginLeft: "2px" }}
                />
              )}
              {isSprintsItem && queuedCount > 0 && (
                <span style={{
                  marginLeft: "auto",
                  background: "#3b82f6",
                  color: "white",
                  fontSize: "10px",
                  fontWeight: 700,
                  borderRadius: "10px",
                  padding: "1px 6px",
                  minWidth: "18px",
                  textAlign: "center",
                }}>
                  {queuedCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Project list under nav */}
      {projects && projects.length > 0 && (
        <div style={{ padding: "0 10px 8px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: "10px", color: "#555565", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 12px 4px" }}>
            Projects
          </div>
          {projects.map((project) => {
            const accent = project.id === "w-construction" ? "#eab308" : "#fb923c";
            const isActive = pathname === `/projects/${project.id}`;
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                onClick={onClose}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "7px 12px",
                  borderRadius: "6px",
                  marginBottom: "1px",
                  textDecoration: "none",
                  background: isActive ? `${accent}18` : "transparent",
                  transition: "all 0.15s ease",
                }}
                className="nav-link"
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: accent, flexShrink: 0 }} />
                  <span style={{ fontSize: "13px", color: isActive ? "#e0e0e8" : "#9ca3af", fontWeight: isActive ? 500 : 400 }}>
                    {project.name}
                  </span>
                </div>
                <span style={{ fontSize: "11px", color: "#555565" }}>{project.sprintCount}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Active sprint indicator */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "8px", paddingBottom: "8px" }}>
        <ActiveSprint compact />
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
        {stats && stats.totalCost > 0 ? (
          <div style={{ fontSize: "11px", color: "#6b7280" }}>
            Total spend:{" "}
            <span style={{ color: "#fb923c", fontWeight: 700 }}>
              ${stats.totalCost.toFixed(2)}
            </span>
          </div>
        ) : (
          <div style={{ fontSize: "11px", color: "#6b7280" }}>v0.1.0 — local dev</div>
        )}
      </div>
    </>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        className="sidebar-hamburger"
        onClick={() => setMobileOpen(true)}
        style={{
          display: "none",
          position: "fixed",
          top: "16px",
          left: "16px",
          zIndex: 100,
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "8px",
          cursor: "pointer",
          color: "#e6e8f0",
        }}
      >
        <Menu size={18} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 49,
          }}
        />
      )}

      {/* Sidebar — desktop always visible, mobile slide-in */}
      <aside
        className={`sidebar-root${mobileOpen ? " sidebar-open" : ""}`}
        style={{
          background: "var(--card)",
          borderRight: "1px solid var(--border)",
          width: "220px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
        }}
      >
        <SidebarContent pathname={pathname} onClose={() => setMobileOpen(false)} />
      </aside>
    </>
  );
}
