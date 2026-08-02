import { useEffect, useState } from "react";
import { Timer, RotateCw, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invoke } from "@/lib/electron";
import { useAppStore } from "@/stores/appStore";
import { toast } from "sonner";

function formatSeconds(s: number): string {
  if (s <= 0) return "now";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function RateLimitBanner() {
  const rateLimit = useAppStore((s) => s.rateLimit);
  const clearRateLimit = useAppStore((s) => s.clearRateLimit);
  const lastPrompt = useAppStore((s) => s.lastPrompt);
  const lastClarify = useAppStore((s) => s.lastClarify);
  const clearDiffs = useAppStore((s) => s.clearDiffs);
  const clearActivity = useAppStore((s) => s.clearActivity);
  const setError = useAppStore((s) => s.setError);
  const beginRun = useAppStore((s) => s.beginRun);
  const endRun = useAppStore((s) => s.endRun);

  const [remaining, setRemaining] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Countdown timer driven by retry_after_seconds.
  useEffect(() => {
    if (!rateLimit?.retryAfterSeconds) return;
    setRemaining(rateLimit.retryAfterSeconds);
    const id = setInterval(() => {
      setRemaining((r) => (r === null ? null : Math.max(0, r - 1)));
    }, 1000);
    return () => clearInterval(id);
  }, [rateLimit?.retryAfterSeconds]);

  if (!rateLimit) return null;

  const canRetry = remaining !== null && remaining <= 0;

  async function retry() {
    if (!lastPrompt) return;
    setRetrying(true);
    clearRateLimit();
    setError(null);
    clearDiffs();
    clearActivity();
    beginRun();
    try {
      await invoke("send_prompt", lastPrompt, lastClarify);
    } catch (err) {
      endRun("idle");
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="border-b bg-amber-50/70 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <div className="flex items-start gap-2">
        <Timer className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="flex-1 space-y-1">
          <div className="font-medium">
            Rate limit reached{rateLimit.model ? ` on ${rateLimit.model}` : ""}
          </div>
          {remaining !== null && remaining > 0 && (
            <div className="text-[11px] opacity-80">
              Retry available in <span className="font-mono">{formatSeconds(remaining)}</span>
              {rateLimit.resetAt && (
                <> · resets at {new Date(rateLimit.resetAt).toLocaleTimeString()}</>
              )}
            </div>
          )}
          {canRetry && (
            <div className="text-[11px] opacity-80">Retry available now.</div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 flex-shrink-0"
          onClick={clearRateLimit}
          title="Dismiss"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={retry}
          disabled={!canRetry || retrying || !lastPrompt}
        >
          {retrying ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Retry{lastPrompt ? ` "${lastPrompt.slice(0, 24)}${lastPrompt.length > 24 ? "…" : ""}"` : ""}
        </Button>
      </div>
    </div>
  );
}
