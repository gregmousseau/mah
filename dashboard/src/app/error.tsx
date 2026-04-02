"use client"

import Link from "next/link"
import { AlertTriangle, Home, RefreshCw } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0e",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          background: "#0f1116",
          border: "1px solid #1c1d26",
          borderRadius: "12px",
          padding: "48px",
          textAlign: "center",
          maxWidth: "480px",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "64px",
            height: "64px",
            borderRadius: "12px",
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            marginBottom: "24px",
          }}
        >
          <AlertTriangle size={28} color="#ef4444" />
        </div>

        <div
          style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "#eff1f5",
            marginBottom: "8px",
          }}
        >
          Something went wrong
        </div>
        <div
          style={{
            fontSize: "13px",
            color: "#9ca3af",
            marginBottom: "16px",
            lineHeight: 1.6,
          }}
        >
          An unexpected error occurred.
        </div>

        {error.message && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "8px",
              padding: "12px 16px",
              marginBottom: "24px",
              fontSize: "12px",
              color: "#ef4444",
              textAlign: "left",
              wordBreak: "break-word",
              fontFamily: "monospace",
            }}
          >
            {error.message}
          </div>
        )}

        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button
            onClick={reset}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              background: "#fb923c",
              color: "#0a0a0e",
              border: "none",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} />
            Try Again
          </button>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              background: "transparent",
              color: "#9ca3af",
              border: "1px solid #1c1d26",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <Home size={14} />
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
