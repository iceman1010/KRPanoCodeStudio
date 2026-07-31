import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invoke } from "@/lib/electron";
import { useAppStore } from "@/stores/appStore";
import { toast } from "sonner";

export function ClarifyChat() {
  const question = useAppStore((s) => s.clarifyQuestion);
  const setPhase = useAppStore((s) => s.setPhase);
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);

  if (!question) return null;

  async function submitAnswer() {
    const trimmed = answer.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      await invoke("clarify_answer", trimmed);
      setAnswer("");
      setPhase("working");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-b bg-violet-50/50 p-3 dark:bg-violet-950/20">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-violet-700 dark:text-violet-300">
        <span>🤖 Clarify</span>
      </div>
      <p className="mb-2 text-sm text-foreground">{question}</p>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Your answer…"
        className="mb-2 min-h-[60px] w-full resize-y rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        disabled={sending}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submitAnswer();
          }
        }}
      />
      <Button size="sm" onClick={submitAnswer} disabled={sending || !answer.trim()}>
        <Send className="mr-1.5 h-3.5 w-3.5" />
        Send answer
      </Button>
    </div>
  );
}
