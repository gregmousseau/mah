"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SprintSummary } from "@/types/mah";

interface SprintTimelineChartProps {
  sprints: SprintSummary[];
  getProjectAccent: (projectId?: string | null) => string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function calculateDuration(createdAt: string, completedAt?: string): string {
  if (!completedAt) return "—";
  const start = new Date(createdAt).getTime();
  const end = new Date(completedAt).getTime();
  const diffMs = end - start;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = (diffMs / 3600000).toFixed(1);
  return `${diffHr}h`;
}

export default function SprintTimelineChart({ sprints, getProjectAccent }: SprintTimelineChartProps) {
  const router = useRouter();
  const [hoveredSprint, setHoveredSprint] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  if (!sprints || sprints.length === 0) {
    return (
      <div style={{ color: "#888898", fontSize: "14px", padding: "24px 0" }}>
        No sprint data available yet.
      </div>
    );
  }

  // Filter out sprints without dates
  const validSprints = sprints.filter((s) => s.createdAt);
  if (validSprints.length === 0) {
    return (
      <div style={{ color: "#888898", fontSize: "14px", padding: "24px 0" }}>
        No sprint data with dates available yet.
      </div>
    );
  }

  // Calculate scales
  const dates = validSprints.map((s) => new Date(s.createdAt).getTime());
  const costs = validSprints.map((s) => s.totalCost);

  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const minCost = 0;
  const maxCost = Math.max(...costs, 0.01);

  // Chart dimensions
  const width = 600;
  const height = 180;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Scale functions
  const scaleX = (timestamp: number) => {
    if (maxDate === minDate) return padding.left + chartWidth / 2;
    return padding.left + ((timestamp - minDate) / (maxDate - minDate)) * chartWidth;
  };

  const scaleY = (cost: number) => {
    return padding.top + chartHeight - (cost / maxCost) * chartHeight;
  };

  const hovered = validSprints.find((s) => s.id === hoveredSprint);

  return (
    <div style={{ padding: "20px 0 8px", position: "relative" }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ overflow: "visible" }}
      >
        {/* Grid lines - Y axis */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + chartHeight - ratio * chartHeight;
          const cost = ratio * maxCost;
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + chartWidth}
                y2={y}
                stroke="#2a2a3a"
                strokeWidth="1"
              />
              <text
                x={padding.left - 5}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fill="#555565"
                fontSize="10"
              >
                ${cost.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* X axis */}
        <line
          x1={padding.left}
          y1={padding.top + chartHeight}
          x2={padding.left + chartWidth}
          y2={padding.top + chartHeight}
          stroke="#2a2a3a"
          strokeWidth="1.5"
        />

        {/* Y axis */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={padding.top + chartHeight}
          stroke="#2a2a3a"
          strokeWidth="1.5"
        />

        {/* Data points */}
        {validSprints.map((sprint) => {
          const timestamp = new Date(sprint.createdAt).getTime();
          const cx = scaleX(timestamp);
          const cy = scaleY(sprint.totalCost);
          const color = getProjectAccent(sprint.projectId);
          const isHovered = hoveredSprint === sprint.id;

          return (
            <circle
              key={sprint.id}
              cx={cx}
              cy={cy}
              r={isHovered ? 6 : 4}
              fill={color}
              stroke={isHovered ? "#ffffff" : "transparent"}
              strokeWidth={isHovered ? 1.5 : 0}
              style={{
                cursor: "pointer",
                transition: "all 0.15s",
                filter: isHovered ? "brightness(1.3)" : "none",
              }}
              onClick={() => router.push(`/sprints/${sprint.id}`)}
              onMouseEnter={(e) => {
                setHoveredSprint(sprint.id);
                const rect = (e.target as SVGCircleElement).getBoundingClientRect();
                setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
              }}
              onMouseLeave={() => setHoveredSprint(null)}
            />
          );
        })}

        {/* X-axis labels */}
        {validSprints.length > 0 && (
          <>
            <text
              x={padding.left}
              y={padding.top + chartHeight + 18}
              textAnchor="start"
              fill="#555565"
              fontSize="10"
            >
              {formatDate(new Date(minDate).toISOString())}
            </text>
            <text
              x={padding.left + chartWidth}
              y={padding.top + chartHeight + 18}
              textAnchor="end"
              fill="#555565"
              fontSize="10"
            >
              {formatDate(new Date(maxDate).toISOString())}
            </text>
          </>
        )}

        {/* Axis labels */}
        <text
          x={padding.left + chartWidth / 2}
          y={height - 5}
          textAnchor="middle"
          fill="#888898"
          fontSize="11"
          fontWeight="500"
        >
          Date
        </text>
        <text
          x={15}
          y={padding.top + chartHeight / 2}
          textAnchor="middle"
          fill="#888898"
          fontSize="11"
          fontWeight="500"
          transform={`rotate(-90 15 ${padding.top + chartHeight / 2})`}
        >
          Cost
        </text>
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div
          style={{
            position: "fixed",
            left: tooltipPos.x,
            top: tooltipPos.y - 10,
            transform: "translate(-50%, -100%)",
            background: "#141420",
            border: "1px solid #3a3a4a",
            borderRadius: "8px",
            padding: "10px 12px",
            fontSize: "12px",
            color: "#e0e0e8",
            pointerEvents: "none",
            zIndex: 1000,
            minWidth: "140px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "4px", color: "#e0e0e8" }}>
            {hovered.name}
          </div>
          <div style={{ fontSize: "11px", color: "#888898", display: "flex", flexDirection: "column", gap: "2px" }}>
            <div>Cost: <span style={{ color: "#a855f7", fontWeight: 600 }}>${hovered.totalCost.toFixed(2)}</span></div>
            <div>Duration: <span style={{ color: "#e0e0e8", fontWeight: 500 }}>{calculateDuration(hovered.createdAt, hovered.completedAt)}</span></div>
            <div style={{ fontSize: "10px", marginTop: "2px", color: "#555565" }}>
              {formatDate(hovered.createdAt)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
