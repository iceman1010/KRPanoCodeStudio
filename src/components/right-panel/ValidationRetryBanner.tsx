import { useState } from "react";
import { AlertTriangle, ChevronDown, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invoke } from "@/lib/electron";
import { useAppStore } from "@/stores/appStore";
import { toast } from "sonner";

export function ValidationRetryBanner() {
  const vr = useAppStore((s) => s.validationRetry);
  const addConversationTurn = useAppStore((s) => s.addConversationTurn);
  const [sending, setSending] = useState(false);

  if (!vr) return null;

  async function accept() {
    setSending(true);
    try {
      await invoke("clarify_answer", "yes");
      addConversationTurn({ kind: "user_validation_retry_yes", attempt: vr!.attempt, timestamp: Date.now() });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  async function decline() {
    setSending(true);
    try {
      await invoke("clarify_answer", "no");
      addConversationTurn({ kind: "user_validation_retry_no", attempt: vr!.attempt, timestamp: Date.now() });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-b bg-amber-50/60 p-3 dark:bg-amber-950/20">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>Invalid XML — attempt {vr.attempt}/{vr.maxAttempts}</span>
      </div>
      <p className="mb-1 text-sm font-medium text-foreground">{vr.message}</p>
      {vr.file && (
        <p className="mb-1 text-xs text-muted-foreground">
          {vr.file}
          {vr.line ? ` (line ${vr.line})` : ""}
        </p>
      )}
      {vr.details && vr.details.length > 0 && (
        <details className="mb-2">
          <summary className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronDown className="h-3 w-3" />
            {vr.details.length} validation error(s)
          </summary>
          <ul className="mt-1 space-y-0.5 pl-4 text-xs text-muted-foreground">
            {vr.details.slice(0, 10).map((d, i) => (
              <li key={i}>Line {d.line}: {d.message}</li>
            ))}
            {vr.details.length > 10 && (
              <li className="italic">…and {vr.details.length - 10} more</li>
            )}
          </ul>
        </details>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={accept} disabled={sending}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Retry fix
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={decline}
          disabled={sending}
          title="Abort this edit and roll back"
        >
          <XCircle className="mr-1.5 h-3.5 w-3.5" />
          Abort
        </Button>
      </div>
    </div>
  );
}
