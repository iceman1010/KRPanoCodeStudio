import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import type { DiffEntry, DiffHunk } from "@/lib/types";

function HunkRow({ hunk }: { hunk: DiffHunk }) {
  return (
    <div className="space-y-0.5 font-mono text-xs">
      {hunk.context && (
        <div className="px-2 py-0.5 text-muted-foreground">
          <span className="mr-2 select-none text-muted-foreground/50">L{hunk.line}</span>
          {hunk.context}
        </div>
      )}
      {hunk.old && (
        <div className="bg-destructive/10 px-2 py-0.5 text-destructive">
          <span className="mr-2 select-none">−</span>
          {hunk.old}
        </div>
      )}
      {hunk.new && (
        <div className="bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">
          <span className="mr-2 select-none">+</span>
          {hunk.new}
        </div>
      )}
    </div>
  );
}

function FileSection({ entry }: { entry: DiffEntry }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs font-medium hover:bg-muted/40"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="font-mono">{entry.file}</span>
        <span className="ml-1 text-muted-foreground">
          ({entry.hunks.length} {entry.hunks.length === 1 ? "change" : "changes"})
        </span>
      </button>
      {open && (
        <div className="space-y-1 border-t px-1 py-1">
          {entry.hunks.map((h, i) => (
            <HunkRow key={i} hunk={h} />
          ))}
        </div>
      )}
    </div>
  );
}

export function DiffViewer() {
  const diffs = useAppStore((s) => s.diffs);
  const error = useAppStore((s) => s.error);

  if (diffs.length === 0 && !error) return null;

  return (
    <div className="space-y-2 border-b p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Diff
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {diffs.map((d: DiffEntry, i: number) => (
          <FileSection key={i} entry={d} />
        ))}
      </div>
    </div>
  );
}
