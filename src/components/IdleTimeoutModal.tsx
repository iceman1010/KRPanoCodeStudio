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

type IdleScope = "edit" | "setup" | "update" | "models" | "version";

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

// Shown when a PHAR (CLI) call has been idle longer than the configured
// threshold (default 5 minutes, configurable in Preferences). The child is
// NOT killed when the timer fires — it is kept alive until the user picks
// Abort or Extend so a genuinely-slow run can keep going.
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

  async function respond(action: "abort" | "extend") {
    setResponding(true);
    try {
      await invoke("respond_idle_timeout", { action });
    } catch {
      // ignore — the main process clears pendingIdle either way
    } finally {
      setResponding(false);
      // On abort the child dies and no new prompt will arrive. On extend a
      // new idle window starts; if it fires again we'll pop once more.
      if (action === "abort") setScope(null);
    }
  }

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
            (for example after the computer woke from sleep). You can give it
            more time or abort the run.
          </p>
          <p className="text-muted-foreground">
            Aborting will cancel the current run and report the failure in the
            activity log. Extending gives it another idle window (the duration
            configured in Preferences).
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
