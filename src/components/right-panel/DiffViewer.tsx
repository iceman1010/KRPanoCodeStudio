import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import type { DiffEntry, DiffHunk } from "@/lib/types";

function HunkRow({
  hunk,
  file,
  hunkIndex,
}: {
  hunk: DiffHunk;
  file: string;
  hunkIndex: number;
}) {
  const setEditingHunk = useAppStore((s) => s.setEditingHunk);
  // Green rows are clickable to open the manual-edit modal. The number of
  // lines the hunk occupies in the new file = number of "\n"-separated
  // segments in `new`. Pure deletions (new === undefined|"") never render a
  // green row so the handler is never attached for them.
  const newCount = hunk.new ? hunk.new.split("\n").length : 0;
  const canEdit = !!hunk.new && hunk.line > 0;

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
        <button
          type="button"
          disabled={!canEdit}
          onClick={
            canEdit
              ? () =>
                  setEditingHunk({
                    file,
                    line: hunk.line,
                    count: newCount,
                    hunkIndex,
                  })
              : undefined
          }
          className="group flex w-full bg-emerald-500/10 px-2 py-0.5 text-left text-emerald-600 transition-colors enabled:hover:bg-emerald-500/20 disabled:cursor-default dark:text-emerald-400"
          title={canEdit ? "Click to edit this line" : undefined}
        >
          <span className="mr-2 select-none text-emerald-600/70 dark:text-emerald-400/70">+</span>
          <span className="flex-1 whitespace-pre-wrap break-all">{hunk.new}</span>
          {canEdit && (
            <Pencil className="ml-1.5 mt-0.5 h-3 w-3 shrink-0 text-emerald-600/50 opacity-0 group-hover:opacity-100 dark:text-emerald-400/50" />
          )}
        </button>
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
            <HunkRow key={i} hunk={h} file={entry.file} hunkIndex={i} />
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
