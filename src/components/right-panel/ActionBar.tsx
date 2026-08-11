import { useState } from "react";
import { Check, Undo2, Loader2, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invoke } from "@/lib/electron";
import { useAppStore } from "@/stores/appStore";
import { toast } from "sonner";

function fmt(n: number): string {
  return n.toLocaleString();
}

function UsageSummaryCard() {
  const usageSummary = useAppStore((s) => s.usageSummary);
  if (!usageSummary) return null;
  const { clarify, edit, retries, grand_total, model } = usageSummary;
  const retryTotal = retries.reduce((sum, r) => sum + r.total_tokens, 0);
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs border-b bg-muted/30 text-muted-foreground">
      <Coins className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="font-mono truncate max-w-[140px]">{model}</span>
      <span className="text-[11px] flex items-center gap-1.5 flex-wrap">
        {clarify && (
          <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300">
            Clarify {fmt(clarify.total_tokens)}
          </span>
        )}
        {edit && (
          <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300">
            Edit {fmt(edit.total_tokens)}
          </span>
        )}
        {retries.length > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
            Retries {fmt(retryTotal)} ({retries.length})
          </span>
        )}
        <span className="font-medium text-foreground">Total {fmt(grand_total)}</span>
      </span>
    </div>
  );
}

export function ActionBar() {
  const phase = useAppStore((s) => s.phase);
  const diffs = useAppStore((s) => s.diffs);
  const setPhase = useAppStore((s) => s.setPhase);
  const clearDiffs = useAppStore((s) => s.clearDiffs);
  const [undoing, setUndoing] = useState(false);

  // Keep / Undo only visible in review state with diffs.
  if (phase !== "review" || diffs.length === 0) return null;

  async function keep() {
    // "Keep" = just discard the diffs from view; writes already happened.
    clearDiffs();
    setPhase("idle");
    toast.success("Changes kept");
  }

  async function undo() {
    setUndoing(true);
    try {
      await invoke("undo");
      // Streamed events will move phase to idle + clear diffs via `restored`.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUndoing(false);
    }
  }

  return (
    <div>
      <UsageSummaryCard />
      <div className="flex gap-2 border-t bg-muted/20 p-3">
        <Button size="sm" onClick={keep} className="flex-1">
          <Check className="mr-1.5 h-3.5 w-3.5" />
          Keep
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={undo}
          disabled={undoing}
          className="flex-1"
        >
          {undoing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Undo2 className="mr-1.5 h-3.5 w-3.5" />}
          Undo
        </Button>
      </div>
    </div>
  );
}
