"use client";

import { useEffect } from "react";
import { X, CheckCircle, AlertCircle } from "lucide-react";

interface ToastProps {
  message: string;
  type?: "success" | "error";
  duration?: number;
  onClose: () => void;
}

export default function Toast({ message, type = "success", duration = 5000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgColor = type === "success" ? "#10b98120" : "#ef444420";
  const borderColor = type === "success" ? "#10b98160" : "#ef444460";
  const iconColor = type === "success" ? "#10b981" : "#ef4444";
  const Icon = type === "success" ? CheckCircle : AlertCircle;

  return (
    <div
      style={{
        position: "fixed",
        top: "24px",
        right: "24px",
        zIndex: 9999,
        background: "#0f1116",
        border: `1px solid ${borderColor}`,
        borderRadius: "12px",
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        minWidth: "300px",
        maxWidth: "500px",
        boxShadow: `0 8px 24px ${borderColor}`,
        animation: "slideInRight 0.3s ease",
      }}
    >
      <div
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "8px",
          background: bgColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={18} color={iconColor} />
      </div>
      <div style={{ flex: 1, fontSize: "13px", color: "#e0e0e8", lineHeight: 1.4 }}>{message}</div>
      <button
        onClick={onClose}
        style={{
          background: "transparent",
          border: "none",
          color: "#9ca3af",
          cursor: "pointer",
          padding: "4px",
          display: "flex",
          flexShrink: 0,
          transition: "color 0.15s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#e0e0e8")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#9ca3af")}
      >
        <X size={16} />
      </button>

      <style jsx>{`
        @keyframes slideInRight {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
