"use client";

import { useEffect, useState } from "react";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Now";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export default function CountdownTimer({ iso, prefix = "Runs in" }: { iso: string; prefix?: string }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    const update = () => {
      const ms = new Date(iso).getTime() - Date.now();
      if (ms <= 0) {
        setLabel("Due now");
      } else {
        setLabel(`${prefix} ${formatCountdown(ms)}`);
      }
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [iso, prefix]);

  return (
    <span style={{ fontSize: "11px", color: "#60a5fa", fontWeight: 500 }}>
      ⏰ {label}
    </span>
  );
}
