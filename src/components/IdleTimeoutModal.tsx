import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { on, invoke } from "@/lib/electron";
import { useAppStore } from "@/stores/appStore";
import { toast } from "sonner";

type IdleScope = "edit" | "setup" | "update" | "models" | "version";
type IdleAction = "abort" | "extend" | "retry";

interface IdleTimeoutPayload {
  scope: IdleScope;
}

const SCOPE_LABEL: Record<IdleScope, string> = {
  edit: "an edit",
  setup: "API key verification",
  update: "a CLI self-update",
  models: "the model list load",
  version: "a CLI version check",
};

// Re-issue the interrupted edit, mirroring ResumeBanner.resume(): merge the
// original prompt with any clarify answer the user already gave (so the fresh
// run won't re-ask), reset the run UI, and send the prompt again. Called after
// the main process has killed the stale child (respond_idle_timeout retry).
async function retryLastEdit() {
  const store = useAppStore.getState();
  const lastEdit = store.lastEdit;
  const merged = store.resumeLastEdit(); // clears failedEdit; null on tour mismatch
  if (!merged || !lastEdit) {
    toast.error("Nothing to retry — the tour may have changed.");
    return;
  }
  store.setError(null);
  store.clearDiffs();
  store.clearActivity();
  store.clearConversation();
  store.beginRun();
  store.addConversationTurn({
    kind: "user_prompt",
    text: merged,
    clarify: !!lastEdit.clarify,
    timestamp: Date.now(),
  });
  try {
    // Same model policy as ResumeBanner: the model the original run used, or
    // the currently selected one when the original had none.
    const model = lastEdit.model ?? store.selectedModel;
    await invoke("send_prompt", {
      prompt: merged,
      clarify: !!lastEdit.clarify,
      model,
    });
  } catch (err) {
    store.endRun("idle");
    toast.error(err instanceof Error ? err.message : String(err));
  }
}

// Shown when a PHAR (CLI) call has been idle longer than the configured
// threshold (default 5 minutes, configurable in Preferences). The child is
// NOT killed when the timer fires — it is kept alive until the user picks
// Abort, Extend, or Retry so a genuinely-slow run can keep going.
export function IdleTimeoutModal() {
  const [scope, setScope] = useState<IdleScope | null>(null);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    on<IdleTimeoutPayload>("cli-idle-timeout", (payload) => {
      if (cancelled) return;
      setScope(payload.scope);
    }).then((fn) => {
      if (cancelled) fn();
      else unsub = fn;
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  async function respond(action: IdleAction) {
    setResponding(true);
    try {
      await invoke("respond_idle_timeout", { action });
      if (action === "retry") await retryLastEdit();
    } catch {
      // ignore — the main process clears pendingIdle either way
    } finally {
      setResponding(false);
      // Close for every action: on abort the child dies and no new prompt
      // arrives; on retry the re-issued prompt drives the UI from here; on
      // extend a fresh idle window starts and we only pop again if THAT
      // window also expires.
      setScope(null);
    }
  }

  // Retry only makes sense for prompt-edit runs — the other scopes have no
  // re-issuable "last request" behind this modal.
  const canRetry = scope === "edit";

  const label = scope ? SCOPE_LABEL[scope] : "a CLI call";

  return (
    <Dialog
      open={!!scope}
      onOpenChange={(open) => {
        // The dialog is non-dismissible except via the buttons — closing it
        // via ESC/overlay would leave the child in limbo. Treat that as abort.
        if (!open && scope && !responding) respond("abort");
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader className="shrink-0">
          <DialogTitle>CLI is unresponsive</DialogTitle>
          <DialogDescription>
            The CLI has produced no output for the configured idle timeout
            while running {label}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p>
            This usually means the network connection to the model proxy died
            (for example after the computer woke from sleep). You can retry the
            request, give it more time, or abort the run.
          </p>
          <p className="text-muted-foreground">
            Retrying cancels the stuck attempt and re-sends the same request
            (including any clarification you already gave) from scratch — no
            partial edits are left behind, the CLI hadn't written any files
            yet. Extending gives it another idle window (the duration
            configured in Preferences). Aborting cancels the run and reports
            the failure in the activity log.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={() => respond("abort")}
            disabled={responding}
          >
            Abort
          </Button>
          <Button
            variant="secondary"
            onClick={() => respond("extend")}
            disabled={responding}
          >
            Extend
          </Button>
          {canRetry && (
            <Button
              onClick={() => respond("retry")}
              disabled={responding}
            >
              Retry
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
