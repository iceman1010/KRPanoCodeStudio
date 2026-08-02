import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { invoke } from "@/lib/electron";
import { useAppStore } from "@/stores/appStore";
import { useRunElapsed } from "@/hooks/useRunElapsed";
import { toast } from "sonner";

export function PromptBox() {
  const phase = useAppStore((s) => s.phase);
  const setLastPrompt = useAppStore((s) => s.setLastPrompt);
  const clearActivity = useAppStore((s) => s.clearActivity);
  const clearDiffs = useAppStore((s) => s.clearDiffs);
  const setError = useAppStore((s) => s.setError);
  const beginRun = useAppStore((s) => s.beginRun);
  const endRun = useAppStore((s) => s.endRun);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const elapsed = useRunElapsed();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const disabled = phase === "working" || phase === "clarify";

  // Reset busy when phase moves out of working.
  useEffect(() => {
    if (phase !== "working" && phase !== "clarify") setBusy(false);
  }, [phase]);

  async function submit(clarify: boolean) {
    const prompt = value.trim();
    if (!prompt || disabled) return;
    setBusy(true);
    setValue("");
    setLastPrompt(prompt, clarify);
    clearDiffs();
    clearActivity();
    setError(null);
    beginRun();
    try {
      await invoke("send_prompt", { prompt, clarify, model: selectedModel });
    } catch (err) {
      setBusy(false);
      endRun("idle");
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function stopEdit() {
    try {
      await invoke("stop_edit");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit(false);
    }
  }

  return (
    <div className="space-y-2 border-b p-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Ask
        </label>
        {busy && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {elapsed ?? "0s"}
            </span>
            <Button variant="ghost" size="sm" onClick={stopEdit} className="h-7 text-xs text-destructive">
              <Square className="mr-1 h-3 w-3 fill-current" />
              Stop
            </Button>
          </div>
        )}
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Describe what you want to change…"
        className="min-h-[80px] resize-y text-sm"
        disabled={disabled}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => submit(false)} disabled={disabled || !value.trim()}>
          <Send className="mr-1.5 h-3.5 w-3.5" />
          Send
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => submit(true)}
          disabled={disabled || !value.trim()}
          title="Ask the AI to clarify intent before editing"
        >
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          Clarify
        </Button>
        <span className="ml-auto self-center text-[10px] text-muted-foreground">
          ⌘↵ to send
        </span>
      </div>
    </div>
  );
}
