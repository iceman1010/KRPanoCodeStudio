import { useState } from "react";
import { Check, Undo2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invoke } from "@/lib/electron";
import { useAppStore } from "@/stores/appStore";
import { toast } from "sonner";

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
  );
}
