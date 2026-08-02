import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/appStore";

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

// Elapsed time since the current edit run started (prompt submitted).
// Returns null when no run is in progress.
export function useRunElapsed(): string | null {
  const runStartedAt = useAppStore((s) => s.runStartedAt);
  const phase = useAppStore((s) => s.phase);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (runStartedAt === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [runStartedAt]);

  if (runStartedAt === null || (phase !== "working" && phase !== "clarify")) {
    return null;
  }
  return formatElapsed(now - runStartedAt);
}
