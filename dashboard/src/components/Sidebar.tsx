"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, List, Radio, Zap } from "lucide-react";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/sprints", icon: List, label: "Sprints" },
  { href: "/live", icon: Radio, label: "Live" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
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
      {/* Logo */}
      <div
        style={{
          padding: "24px 20px 20px",
          borderBottom: "1px solid #2a2a3a",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "8px",
            background: "linear-gradient(135deg, #7c3aed, #a855f7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Zap size={14} color="white" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: "14px", color: "#e0e0e8", letterSpacing: "0.05em" }}>MAH</div>
          <div style={{ fontSize: "11px", color: "#888898" }}>Multi-Agent Harness</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: "12px 10px", flex: 1 }}>
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
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

      {/* Footer */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid #2a2a3a" }}>
        <div style={{ fontSize: "11px", color: "#555565" }}>v0.1.0 — local dev</div>
      </div>
    </aside>
  );
}
