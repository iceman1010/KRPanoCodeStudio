import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, MessageSquare, Loader2, FileText, Terminal, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { invoke } from "@/lib/electron";
import { useAppStore } from "@/stores/appStore";
import type { ConversationTurn } from "@/lib/types";
import { cn } from "@/lib/utils";

function ToolIcon({ name, className }: { name: string; className?: string }) {
  if (name === "read_file" || name === "write_file") return <FileText className="h-3 w-3" />;
  if (name === "docsearch") return <MessageSquare className="h-3 w-3" />;
  return <Terminal className="h-3 w-3" />;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function TurnRow({ turn }: { turn: ConversationTurn }) {
  const now = Date.now();
  const isRecent = now - turn.timestamp < 5000;

  switch (turn.kind) {
    case "user_prompt": {
      return (
        <div className="mb-4 flex gap-3">
          <div className="flex-shrink-0 w-20 text-center text-xs text-muted-foreground pt-0.5">
            {formatTime(turn.timestamp)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-primary">You</span>
              {turn.clarify && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300 rounded">
                  Clarify
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">{formatTime(turn.timestamp)}</span>
            </div>
            <div className="bg-muted/50 p-3 rounded-md border border-muted/30 text-sm whitespace-pre-wrap font-mono">
              {turn.text}
            </div>
          </div>
        </div>
      );
    }
    case "user_clarify_answer": {
      return (
        <div className="mb-4 flex gap-3 ml-6">
          <div className="flex-shrink-0 w-20 text-center text-xs text-muted-foreground pt-0.5">
            {formatTime(turn.timestamp)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-primary">You (answer)</span>
              <span className="text-[10px] text-muted-foreground">{formatTime(turn.timestamp)}</span>
            </div>
            <div className="bg-primary/10 p-3 rounded-md border border-primary/20 text-sm whitespace-pre-wrap">
              {turn.text}
            </div>
          </div>
        </div>
      );
    }
    case "user_skip": {
      return (
        <div className="mb-4 flex gap-3 ml-6">
          <div className="flex-shrink-0 w-20 text-center text-xs text-muted-foreground pt-0.5">
            {formatTime(turn.timestamp)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-destructive">You (skip)</span>
              <span className="text-[10px] text-muted-foreground">{formatTime(turn.timestamp)}</span>
            </div>
            <div className="bg-destructive/10 p-3 rounded-md border border-destructive/20 text-sm text-destructive">
              Clarification skipped — edit rolled back
            </div>
          </div>
        </div>
      );
    }
    case "model_clarify_question": {
      return (
        <div className="mb-4 flex gap-3">
          <div className="flex-shrink-0 w-20 text-center text-xs text-muted-foreground pt-0.5">
            {formatTime(turn.timestamp)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-violet-600 dark:text-violet-400">🤖 Clarify</span>
              <span className="text-[10px] text-muted-foreground">{formatTime(turn.timestamp)}</span>
            </div>
            <div className="bg-violet-50/50 dark:bg-violet-950/20 p-3 rounded-md border border-violet-200/50 dark:border-violet-800/50 text-sm whitespace-pre-wrap">
              {turn.text}
            </div>
          </div>
        </div>
      );
    }
    case "model_reasoning": {
      return (
        <div className="mb-2 flex gap-3">
          <div className="flex-shrink-0 w-20 text-center text-xs text-muted-foreground pt-0.5">
            {formatTime(turn.timestamp)}
          </div>
          <div className="flex-1 pl-6">
            <div className="text-xs text-muted-foreground mb-0.5">🤖 Reasoning</div>
            <div className="bg-muted/30 p-2 rounded-md border border-muted/20 text-sm italic text-muted-foreground whitespace-pre-wrap">
              {turn.text}
            </div>
          </div>
        </div>
      );
    }
    case "model_tool": {
      return (
        <div className="mb-2 flex gap-3">
          <div className="flex-shrink-0 w-20 text-center text-xs text-muted-foreground pt-0.5">
            {formatTime(turn.timestamp)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 text-xs">
              <ToolIcon name={turn.toolName} className="text-muted-foreground" />
              <span className="font-mono font-medium">{turn.toolName}</span>
              {turn.file && <span className="text-muted-foreground">{turn.file}</span>}
              {turn.query && <span className="text-muted-foreground truncate max-w-[200px]">"{turn.query}"</span>}
              {typeof turn.bytes === "number" && (
                <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded border">{turn.bytes} B</span>
              )}
              {typeof turn.ms === "number" && <span className="text-[10px] text-muted-foreground">{(turn.ms / 1000).toFixed(1)}s</span>}
            </div>
          </div>
        </div>
      );
    }
    case "model_diff": {
      return (
        <div className="mb-2 flex gap-3">
          <div className="flex-shrink-0 w-20 text-center text-xs text-muted-foreground pt-0.5">
            {formatTime(turn.timestamp)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-xs font-medium text-sky-600 dark:text-sky-400">🤖 Diff</span>
              <span className="font-mono text-sm text-sky-600 dark:text-sky-400">{turn.file}</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300 rounded">
                {turn.hunks.length} hunk{turn.hunks.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>
      );
    }
    case "model_done": {
      return (
        <div className="mb-4 flex gap-3">
          <div className="flex-shrink-0 w-20 text-center text-xs text-muted-foreground pt-0.5">
            {formatTime(turn.timestamp)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="font-medium text-emerald-600 dark:text-emerald-400">Done</span>
              {typeof turn.ms === "number" && (
                <span className="text-xs text-muted-foreground">in {(turn.ms / 1000).toFixed(1)}s</span>
              )}
            </div>
          </div>
        </div>
      );
    }
    case "model_error": {
      return (
        <div className="mb-4 flex gap-3">
          <div className="flex-shrink-0 w-20 text-center text-xs text-muted-foreground pt-0.5">
            {formatTime(turn.timestamp)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="font-medium text-destructive">Error</span>
            </div>
            <div className="ml-6 mt-1 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive font-mono">
              {turn.message}
            </div>
          </div>
        </div>
      );
    }
    case "model_restored": {
      return (
        <div className="mb-4 flex gap-3">
          <div className="flex-shrink-0 w-20 text-center text-xs text-muted-foreground pt-0.5">
            {formatTime(turn.timestamp)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 text-amber-500" />
              <span className="font-medium text-amber-600 dark:text-amber-400">Restored</span>
            </div>
            <div className="ml-6 mt-1 text-xs text-muted-foreground font-mono">
              {turn.files.join(", ")}
            </div>
          </div>
        </div>
      );
    }
  }
}

export function ConversationLog() {
  const conversation = useAppStore((s) => s.conversation);
  const clearConversation = useAppStore((s) => s.clearConversation);
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation, open]);

  async function copyTranscript() {
    const lines = conversation.map((t) => {
      const time = formatTime(t.timestamp);
      switch (t.kind) {
        case "user_prompt":
          return `[${time}] You${t.clarify ? " (clarify)" : ""}: ${t.text}`;
        case "user_clarify_answer":
          return `[${time}] You (answer): ${t.text}`;
        case "user_skip":
          return `[${time}] You (skip): Clarification skipped — edit rolled back`;
        case "model_clarify_question":
          return `[${time}] Model (clarify): ${t.text}`;
        case "model_reasoning":
          return `[${time}] Model (reasoning): ${t.text}`;
        case "model_tool":
          return `[${time}] Tool: ${t.toolName}${t.file ? ` ${t.file}` : ""}${t.query ? ` "${t.query}"` : ""}${typeof t.bytes === "number" ? ` ${t.bytes}B` : ""}${typeof t.ms === "number" ? ` ${(t.ms / 1000).toFixed(1)}s` : ""}`;
        case "model_diff":
          return `[${time}] Diff: ${t.file} (${t.hunks.length} hunks)`;
        case "model_done":
          return `[${time}] Done${typeof t.ms === "number" ? ` in ${(t.ms / 1000).toFixed(1)}s` : ""}`;
        case "model_error":
          return `[${time}] Error: ${t.message}`;
        case "model_restored":
          return `[${time}] Restored: ${t.files.join(", ")}`;
      }
    });
    await navigator.clipboard.writeText(lines.join("\n"));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Conversation Log">
          <MessageSquare className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="border-b p-4 pr-12">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              <span>Conversation Log</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={copyTranscript} disabled={conversation.length === 0} title="Copy transcript">
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[calc(90vh-120px)] p-4">
          <div ref={scrollRef} className="space-y-2">
            {conversation.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No conversation yet. Send a prompt to start.</p>
            ) : (
              conversation.map((turn, i) => <TurnRow key={i} turn={turn} />)
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}