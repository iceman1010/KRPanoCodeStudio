import { useState } from "react";
import { ChevronRight, ChevronDown, Lock, FileCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/appStore";

export function FilesSummary() {
  const editable = useAppStore((s) => s.editable);
  const locked = useAppStore((s) => s.locked);
  const [open, setOpen] = useState(false);

  if (editable.length === 0 && locked.length === 0) return null;

  return (
    <div className="border-b">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span className="font-medium uppercase tracking-wide text-muted-foreground">
          Files
        </span>
        <span className="text-muted-foreground">
          {editable.length} editable
          {locked.length > 0 && ` · ${locked.length} locked`}
        </span>
      </button>
      {open && (
        <ul className="space-y-0.5 px-3 pb-2 text-xs">
          {editable.map((f) => (
            <li key={f} className="flex items-center gap-2 py-0.5">
              <FileCode className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono">{f}</span>
              <Badge variant="outline" className="ml-auto text-[10px]">editable</Badge>
            </li>
          ))}
          {locked.map((f) => (
            <li key={f} className="flex items-center gap-2 py-0.5 opacity-70">
              <Lock className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono">{f}</span>
              <Badge variant="secondary" className="ml-auto text-[10px]">locked</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
