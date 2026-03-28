"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, List, Radio, Zap, Menu, X } from "lucide-react";
import { useState } from "react";
import ActiveSprint from "@/components/ActiveSprint";
import { usePolling } from "@/hooks/usePolling";
import type { MahConfig } from "@/types/mah";

interface Stats {
  totalCost: number;
}

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/sprints", icon: List, label: "Sprints" },
  { href: "/live", icon: Radio, label: "Live" },
];

function SidebarContent({ pathname, onClose }: { pathname: string; onClose?: () => void }) {
  const { data: config } = usePolling<MahConfig>("/api/config", 60000);
  const { data: stats } = usePolling<Stats>("/api/stats", 15000);

  return (
    <>
      {/* Logo */}
      <div
        style={{
          padding: "24px 20px 20px",
          borderBottom: "1px solid #2a2a3a",
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
              background: "linear-gradient(135deg, #7c3aed, #a855f7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Zap size={14} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "14px", color: "#e0e0e8", letterSpacing: "0.05em" }}>MAH</div>
            <div style={{ fontSize: "11px", color: "#888898" }}>
              {config?.project?.name || "Multi-Agent Harness"}
            </div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#888898", padding: "4px" }}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ padding: "12px 10px", flex: 1 }}>
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
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
                fontWeight: active ? 500 : 400,
                color: active ? "#e0e0e8" : "#888898",
                background: active ? "rgba(124, 58, 237, 0.15)" : "transparent",
                transition: "all 0.15s ease",
              }}
              className="nav-link"
            >
              <Icon size={16} color={active ? "#a855f7" : "#888898"} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Active sprint indicator */}
      <div style={{ borderTop: "1px solid #2a2a3a", paddingTop: "8px", paddingBottom: "8px" }}>
        <ActiveSprint compact />
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 20px", borderTop: "1px solid #2a2a3a" }}>
        {stats && stats.totalCost > 0 ? (
          <div style={{ fontSize: "11px", color: "#555565" }}>
            Total spend:{" "}
            <span style={{ color: "#7c3aed", fontWeight: 600 }}>
              ${stats.totalCost.toFixed(2)}
            </span>
          </div>
        ) : (
          <div style={{ fontSize: "11px", color: "#555565" }}>v0.1.0 — local dev</div>
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
          background: "#141420",
          border: "1px solid #2a2a3a",
          borderRadius: "8px",
          padding: "8px",
          cursor: "pointer",
          color: "#e0e0e8",
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
          background: "#0d0d18",
          borderRight: "1px solid #2a2a3a",
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
