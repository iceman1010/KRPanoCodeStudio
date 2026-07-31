import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileSearch, FilePen, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/appStore";
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

export function ActivityLog() {
  const activity = useAppStore((s) => s.activity);
  const phase = useAppStore((s) => s.phase);
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom while streaming.
  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activity, collapsed]);

  // Auto-collapse once we reach review (per LAYOUT.md).
  useEffect(() => {
    if (phase === "review") setCollapsed(true);
    if (phase === "working") setCollapsed(false);
  }, [phase]);

  if (activity.length === 0 && phase !== "working") return null;

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
      </button>
      {!collapsed && (
        <div ref={scrollRef} className="max-h-[180px] overflow-y-auto px-3 pb-2">
          {activity.length === 0 ? (
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
        </div>
      )}
    </div>
  );
}
