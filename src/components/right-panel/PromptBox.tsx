import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { invoke } from "@/lib/electron";
import { useAppStore } from "@/stores/appStore";
import { toast } from "sonner";

export function PromptBox() {
  const phase = useAppStore((s) => s.phase);
  const setLastPrompt = useAppStore((s) => s.setLastPrompt);
  const clearActivity = useAppStore((s) => s.clearActivity);
  const clearDiffs = useAppStore((s) => s.clearDiffs);
  const setError = useAppStore((s) => s.setError);
  const setPhase = useAppStore((s) => s.setPhase);
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
    setLastPrompt(prompt);
    clearDiffs();
    clearActivity();
    setError(null);
    setPhase("working");
    try {
      await invoke("send_prompt", prompt, clarify);
    } catch (err) {
      setBusy(false);
      setPhase("idle");
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
          <Button variant="ghost" size="sm" onClick={stopEdit} className="h-7 text-xs text-destructive">
            <Square className="mr-1 h-3 w-3 fill-current" />
            Stop
          </Button>
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
