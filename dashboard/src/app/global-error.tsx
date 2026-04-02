"use client"

import { AlertOctagon, RefreshCw } from "lucide-react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#0a0a0e",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          boxSizing: "border-box",
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
            <AlertOctagon size={28} color="#ef4444" />
          </div>

          <div
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#eff1f5",
              marginBottom: "8px",
            }}
          >
            Critical error
          </div>
          <div
            style={{
              fontSize: "13px",
              color: "#9ca3af",
              marginBottom: "16px",
              lineHeight: 1.6,
            }}
          >
            A fatal error occurred. Please try reloading the application.
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
        </div>
      </body>
    </html>
  )
}
