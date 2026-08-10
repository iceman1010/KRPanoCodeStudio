import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { invoke } from "@/lib/electron";
import { useAppStore } from "@/stores/appStore";
import { toast } from "sonner";

// Manual diff-hunk editor. Triggered when the user clicks a green (added) row
// in the DiffViewer. The CLI is NOT involved — we read the file the LLM wrote,
// isolate the hunk's line range, let the user edit, and write the file back.
// On save we also mutate the store's `diffs` entry so the viewer reflects the
// manual edit without re-running the CLI.
//
// Splice semantics on save:
//   - The edited textarea text is split on "\n".
//   - The resulting N lines replace the original `count` lines in the file
//     at index `line-1` (1-based → 0-based). N can differ from `count` —
//     adding or removing lines is fine; the file shrinks/grows accordingly.
export function EditDiffLineModal() {
  const editingHunk = useAppStore((s) => s.editingHunk);
  const setEditingHunk = useAppStore((s) => s.setEditingHunk);
  const applyHunkEdit = useAppStore((s) => s.applyHunkEdit);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originalLines, setOriginalLines] = useState<string[]>([]);
  const [text, setText] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  // When editingHunk becomes non-null, load the file and slice the hunk's
  // line range. Reset all transients on close.
  useEffect(() => {
    if (!editingHunk) {
      setOriginalLines([]);
      setText("");
      setError(null);
      setLoading(false);
      setSaving(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const content = await invoke<string>("read_file", editingHunk.file);
        if (cancelled) return;
        // Normalize to \n and split. Keep a trailing empty string for files
        // ending in \n so the line count matches what a user expects; the
        // standard split("\n") on "a\nb\n" yields ["a","b",""] which we keep
        // — it represents the line boundary, not a phantom line, when we
        // rejoin with "\n".
        const all = content.replace(/\r\n/g, "\n").split("\n");
        const start = editingHunk.line - 1;
        const end = start + editingHunk.count;
        if (start < 0 || end > all.length) {
          throw new Error(
            `hunk line range ${editingHunk.line}+${editingHunk.count} ` +
            `outside file (has ${all.length} lines)`,
          );
        }
        setOriginalLines(all);
        setText(all.slice(start, end).join("\n"));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setEditingHunk(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [editingHunk, setEditingHunk]);

  // Focus the textarea once content is loaded.
  useEffect(() => {
    if (!loading && editingHunk && textRef.current) {
      textRef.current.focus();
    }
  }, [loading, editingHunk]);

  async function save() {
    if (!editingHunk) return;
    setSaving(true);
    setError(null);
    try {
      const edited = text.replace(/\r\n/g, "\n").split("\n");
      const start = editingHunk.line - 1;
      const end = start + editingHunk.count;
      const spliced = [
        ...originalLines.slice(0, start),
        ...edited,
        ...originalLines.slice(end),
      ];
      const newContent = spliced.join("\n");
      await invoke("write_file", editingHunk.file, newContent);
      // Reflect the manual edit in the store's diffs so DiffViewer shows the
      // user's edited text instead of the stale LLM output.
      applyHunkEdit(editingHunk.file, editingHunk.hunkIndex, edited.join("\n"));
      toast.success(`Saved ${editingHunk.file}`);
      setEditingHunk(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (saving) return;
    setEditingHunk(null);
  }

  const editedCount = text ? text.replace(/\r\n/g, "\n").split("\n").length : 0;
  const lineDelta = editingHunk ? editedCount - editingHunk.count : 0;

  return (
    <Dialog
      open={!!editingHunk}
      onOpenChange={(open) => { if (!open) cancel(); }}
    >
      <DialogContent className="sm:max-w-2xl md:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Edit line {editingHunk?.line}</DialogTitle>
          <DialogDescription>
            {editingHunk?.file} —{" "}
            {editingHunk?.count === 1
              ? "1 line"
              : `${editingHunk?.count} lines (starting at ${editingHunk?.line})`}
            . Changes write directly to the file on disk; the CLI is not
            involved.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading file…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && editingHunk && (
          <div className="space-y-2">
            <textarea
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              className="h-64 w-full resize-y rounded-md border bg-background p-2 font-mono text-xs leading-relaxed outline-none ring-1 ring-transparent focus-visible:ring-ring"
              placeholder="Edit the added line(s)…"
            />
            {lineDelta !== 0 && (
              <p className="text-xs text-muted-foreground">
                This edit will {lineDelta > 0 ? "add" : "remove"}{" "}
                {Math.abs(lineDelta)}{" "}
                {Math.abs(lineDelta) === 1 ? "line" : "lines"} relative to the
                original hunk. The file will adjust accordingly.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={cancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || loading || !!error}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
