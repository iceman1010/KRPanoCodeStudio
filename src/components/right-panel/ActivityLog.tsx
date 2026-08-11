import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileSearch, FilePen, BookOpen, Loader2, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/appStore";
import { useRunElapsed } from "@/hooks/useRunElapsed";
import type { ActivityEntry } from "@/lib/types";

function ToolIcon({ name }: { name: string }) {
  if (name === "read_file" || name === "write_file") return <FilePen className="h-3 w-3" />;
  if (name === "docsearch") return <BookOpen className="h-3 w-3" />;
  return <FileSearch className="h-3 w-3" />;
}

function ToolRow({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-xs">
      <ToolIcon name={entry.toolName ?? ""} />
      <span className="font-mono">{entry.toolName}</span>
      {entry.file && <span className="font-mono text-muted-foreground">{entry.file}</span>}
      {entry.files && entry.files.length > 0 && (
        <span className="truncate text-muted-foreground">{entry.files.join(", ")}</span>
      )}
      {entry.query && (
        <span className="truncate text-muted-foreground">"{entry.query}"</span>
      )}
      {typeof entry.bytes === "number" && (
        <Badge variant="outline" className="text-[10px]">{entry.bytes} B</Badge>
      )}
      {typeof entry.ms === "number" && (
        <span className="ml-auto text-muted-foreground">{(entry.ms / 1000).toFixed(1)}s</span>
      )}
    </div>
  );
}

function ReasoningRow({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="py-0.5 pl-5 text-xs italic text-muted-foreground">{entry.text}</div>
  );
}

const PHASE_BADGE_CLASS: Record<string, string> = {
  clarify:
    "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
  edit:
    "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
  retry:
    "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
};

const PHASE_LABEL: Record<string, string> = {
  clarify: "Clarify",
  edit: "Edit",
  retry: "Retry",
};

function UsageRow({
  phase,
  model,
  total,
  prompt,
  completion,
  index,
}: {
  phase: "clarify" | "edit" | "retry";
  model: string;
  total: number;
  prompt: number;
  completion: number;
  index: number;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-xs">
      <Coins className="h-3 w-3 text-muted-foreground" />
      <span
        className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${PHASE_BADGE_CLASS[phase] ?? ""}`}
      >
        {PHASE_LABEL[phase] ?? phase}
      </span>
      <span className="font-mono text-muted-foreground truncate max-w-[120px]">{model}</span>
      <span className="ml-auto text-muted-foreground tabular-nums">
        {total.toLocaleString()}
      </span>
      <span className="text-[10px] text-muted-foreground/70 hidden sm:inline" title={`Prompt ${prompt.toLocaleString()} · Completion ${completion.toLocaleString()}`}>
        ↑{prompt.toLocaleString()} ↓{completion.toLocaleString()}
      </span>
    </div>
  );
}

export function ActivityLog() {
  const activity = useAppStore((s) => s.activity);
  const phase = useAppStore((s) => s.phase);
  const usageEvents = useAppStore((s) => s.usageEvents);
  const elapsed = useRunElapsed();
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom while streaming.
  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activity, usageEvents, collapsed]);

  // Auto-collapse once we reach review (per LAYOUT.md).
  useEffect(() => {
    if (phase === "review") setCollapsed(true);
    if (phase === "working") setCollapsed(false);
  }, [phase]);

  if (activity.length === 0 && usageEvents.length === 0 && phase !== "working") return null;

  // Running total across all usage events for the current run, live in the header.
  const runningTotal = usageEvents.reduce((sum, u) => sum + u.total_tokens, 0);

  return (
    <div className="border-b">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
        <span className="font-medium uppercase tracking-wide text-muted-foreground">
          Activity
        </span>
        <span className="text-muted-foreground">
          {collapsed
            ? `${activity.length} ${activity.length === 1 ? "call" : "calls"}`
            : null}
        </span>
        {runningTotal > 0 && (
          <Badge variant="secondary" className="text-[10px] ml-1">
            <Coins className="mr-1 h-2.5 w-2.5" />
            {runningTotal.toLocaleString()}
          </Badge>
        )}
        {elapsed && (
          <span className="ml-auto flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="tabular-nums">{elapsed}</span>
          </span>
        )}
      </button>
      {!collapsed && (
        <div ref={scrollRef} className="max-h-[180px] overflow-y-auto px-3 pb-2">
          {activity.length === 0 && usageEvents.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">Working…</p>
          ) : (
            activity.map((a) =>
              a.kind === "reasoning" ? (
                <ReasoningRow key={a.id} entry={a} />
              ) : (
                <ToolRow key={a.id} entry={a} />
              ),
            )
          )}
          {usageEvents.length > 0 && (
            <div className="mt-1 pt-1 border-t border-border/40">
              {usageEvents.map((u, i) => (
                <UsageRow
                  key={i}
                  index={i}
                  phase={u.phase}
                  model={u.model}
                  total={u.total_tokens}
                  prompt={u.prompt_tokens}
                  completion={u.completion_tokens}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
