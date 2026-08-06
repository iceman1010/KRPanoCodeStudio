import { useState } from "react";
import { RotateCcw, X, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invoke } from "@/lib/electron";
import { useAppStore } from "@/stores/appStore";
import { toast } from "sonner";

/**
 * Banner shown after a transient upstream failure (HTTP 5xx / gateway 524)
 * that blocked an edit mid-run. Offers a Resume button that re-issues the
 * same Prompt + clarify answer so the user doesn't have to retype, and a
 * short explanation of what resume does (re-runs from a clean backup; the
 * CLI's own auto-retry already failed).
 *
 * Distinct from RateLimitBanner, which handles 429 with a countdown.
 */
export function ResumeBanner() {
  const lastEdit = useAppStore((s) => s.failedEdit);
  const tour = useAppStore((s) => s.tour);
  const phase = useAppStore((s) => s.phase);
  const rateLimit = useAppStore((s) => s.rateLimit);
  const setError = useAppStore((s) => s.setError);
  const resumeLastEdit = useAppStore((s) => s.resumeLastEdit);
  const beginRun = useAppStore((s) => s.beginRun);
  const endRun = useAppStore((s) => s.endRun);
  const clearDiffs = useAppStore((s) => s.clearDiffs);
  const clearActivity = useAppStore((s) => s.clearActivity);
  const clearConversation = useAppStore((s) => s.clearConversation);
  const selectedModel = useAppStore((s) => s.selectedModel);

  const [resuming, setResuming] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Only show when:
  //  - a transient failure promoted lastEdit → failedEdit
  //  - it belongs to the currently-open tour
  //  - we're not mid-run / mid-clarify
  //  - a rate-limit banner isn't already the active flow (429 has its own UI)
  const visible =
    !!lastEdit &&
    !!tour &&
    tour.folder === lastEdit.tourFolder &&
    !rateLimit &&
    (phase === "idle" || phase === "review");

  if (!visible || !lastEdit) return null;

  async function resume() {
    // Re-issue the same edit. Resume uses --clarify only when the ORIGINAL
    // edit used --clarify; the merged instruction for a clarified edit
    // already carries the user's answer so the new run won't re-ask.
    const merged = resumeLastEdit();
    if (!merged) {
      toast.error("Nothing to resume — the tour may have changed.");
      return;
    }
    setResuming(true);
    setError(null);
    clearDiffs();
    clearActivity();
    clearConversation();
    beginRun();
    const now = Date.now();
    useAppStore.getState().addConversationTurn({
      kind: "user_prompt",
      text: merged,
      clarify: !!lastEdit?.clarify,
      timestamp: now,
    });
    try {
      // Pass the same model that was used in the original run (or the
      // currently selected one if the original had none).
      const model = lastEdit?.model ?? selectedModel;
      await invoke("send_prompt", {
        prompt: merged,
        clarify: !!lastEdit?.clarify,
        model,
      });
    } catch (err) {
      endRun("idle");
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setResuming(false);
    }
  }

  function dismiss() {
    setError(null);
  }

  const promptPreview = lastEdit.prompt.length > 40
    ? `${lastEdit.prompt.slice(0, 40)}…`
    : lastEdit.prompt;

  // Visible only when phase is idle/review, so the button doesn't need a
  // phase-disabled check (TypeScript narrows phase to "idle"|"review" here).
  const disabledByPhase = false;

  return (
    <div className="border-b bg-blue-50/70 p-3 text-xs text-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
      <div className="flex items-start gap-2">
        <RotateCcw className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="flex-1 space-y-1">
          <div className="font-medium">
            Network hiccup blocked the edit
          </div>
          <div className="text-[11px] opacity-80">
            Re-run &ldquo;{promptPreview}&rdquo;
            {lastEdit.clarifyAnswer ? " (with your clarification)" : ""} from a clean backup.
          </div>
          <button
            type="button"
            className="flex items-center gap-1 text-[10px] text-blue-700/80 hover:text-blue-900 dark:text-blue-300/80 dark:hover:text-blue-200"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Hide details" : "What does this do?"}
          </button>
          {expanded && (
            <div className="mt-1 space-y-1 text-[10px] opacity-80">
              <p>
                The CLI's automatic retry already exhausted its attempts, so this re-spawns
                the edit from scratch with your original intent. Files on disk were rolled
                back by the CLI when the failure happened — nothing is half-applied.
              </p>
              <p>
                Resume uses the <span className="font-mono">--clarify</span> flag iff the
                original edit did, and folds your clarification answer into the prompt so the
                new run won't re-ask. If the upstream is still timing out, it will fail the
                same way — try again later.
              </p>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 flex-shrink-0"
          onClick={dismiss}
          title="Dismiss"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={resume}
          disabled={resuming || disabledByPhase}
        >
          {resuming ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Resume edit
        </Button>
      </div>
    </div>
  );
}
