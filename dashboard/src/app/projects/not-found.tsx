import Link from "next/link"
import { FileQuestion, Home } from "lucide-react"

export default function ProjectNotFound() {
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
            background: "rgba(251, 146, 60, 0.12)",
            border: "1px solid rgba(251, 146, 60, 0.3)",
            marginBottom: "24px",
          }}
        >
          <FileQuestion size={28} color="#fb923c" />
        </div>

        <div
          style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "#eff1f5",
            marginBottom: "8px",
          }}
        >
          Project not found
        </div>
        <div
          style={{
            fontSize: "13px",
            color: "#9ca3af",
            marginBottom: "32px",
            lineHeight: 1.6,
          }}
        >
          This project doesn&apos;t exist or may have been removed.
        </div>

        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 20px",
            background: "#fb923c",
            color: "#0a0a0e",
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
  )
}
