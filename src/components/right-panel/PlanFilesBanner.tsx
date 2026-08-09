import { useState } from "react";
import { Check, FileSearch, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invoke } from "@/lib/electron";
import { useAppStore } from "@/stores/appStore";
import { toast } from "sonner";

export function PlanFilesBanner() {
  const pf = useAppStore((s) => s.planFiles);
  const addConversationTurn = useAppStore((s) => s.addConversationTurn);
  const [sending, setSending] = useState(false);

  if (!pf) return null;

  async function approve() {
    setSending(true);
    try {
      await invoke("clarify_answer", "yes");
      addConversationTurn({
        kind: "user_plan_files_yes",
        files: pf!.files,
        timestamp: Date.now(),
      });
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
      addConversationTurn({
        kind: "user_plan_files_no",
        files: pf!.files,
        reason: "Declined at the banner",
        timestamp: Date.now(),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-b bg-amber-50/60 p-3 dark:bg-amber-950/20">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
        <FileSearch className="h-3.5 w-3.5" />
        <span>Proposed file access — approve pre-read?</span>
      </div>
      <p className="mb-2 text-sm text-foreground">{pf.reason}</p>
      <ul className="mb-2 space-y-0.5 pl-4 text-xs text-muted-foreground">
        {pf.files.map((f) => (
          <li key={f} className="font-mono">{f}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button size="sm" onClick={approve} disabled={sending}>
          <Check className="mr-1.5 h-3.5 w-3.5" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={decline}
          disabled={sending}
          title="Decline — the model falls back to individual read_file calls"
        >
          <X className="mr-1.5 h-3.5 w-3.5" />
          Decline
        </Button>
      </div>
    </div>
  );
}
