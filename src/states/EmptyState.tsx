import { useState, useEffect } from "react";
import { Globe, FolderOpen, Clock, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { invoke } from "@/lib/electron";
import { useAppStore } from "@/stores/appStore";
import { toast } from "sonner";

function basename(folder: string): string {
  const clean = folder.replace(/[\\/]+$/, "");
  const idx = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
  return idx >= 0 ? clean.slice(idx + 1) : clean;
}

function format_elapsed(openedAt: number): string {
  const diffMs = Date.now() - openedAt;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(openedAt).toLocaleDateString();
}

export function EmptyState() {
  const openTour = useAppStore((s) => s.openTour);
  const recentTours = useAppStore((s) => s.recentTours);
  const setRecentTours = useAppStore((s) => s.setRecentTours);
  const [busyFolder, setBusyFolder] = useState<string | null>(null);

  // Re-load recent tours whenever the empty state is shown (covers both
  // app startup and returning here after closing a tour).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const recent = await invoke<
          { folder: string; openedAt: number }[] | null
        >("get_preference", "recentTours");
        if (!cancelled && Array.isArray(recent)) setRecentTours(recent);
      } catch (err) {
        console.error("Failed to load recent tours:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setRecentTours]);

  async function loadTour(folder: string) {
    setBusyFolder(folder);
    try {
      const previewUrl = await invoke<string>("open_tour", folder);
      openTour(folder, previewUrl);
      toast.success("Tour loaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyFolder(null);
    }
  }

  async function pickFolder() {
    setBusyFolder("__picker__");
    try {
      const folder = await invoke<string | null>("pick_folder");
      if (!folder) return;
      await loadTour(folder);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyFolder(null);
    }
  }

  const pickerBusy = busyFolder === "__picker__";

  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/30">
      <div className="flex w-full max-w-md flex-col items-center gap-5 px-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Globe className="h-10 w-10" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Open a KRPano tour</h2>
          <p className="text-sm text-muted-foreground">
            Pick a tour folder containing{" "}
            <code className="rounded bg-muted px-1">index.html</code> and your tour XML.
          </p>
        </div>
        <Button size="lg" onClick={pickFolder} disabled={pickerBusy}>
          <FolderOpen className="mr-2 h-4 w-4" />
          {pickerBusy ? "Loading…" : "Choose folder…"}
        </Button>

        {recentTours.length > 0 && (
          <div className="mt-2 w-full">
            <div className="mb-2 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Recent tours
            </div>
            <TooltipProvider delayDuration={400}>
              <ul className="flex flex-col gap-1">
                {recentTours.map((t) => (
                  <li key={t.folder}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => loadTour(t.folder)}
                          disabled={busyFolder !== null}
                          className="group flex w-full items-center gap-2.5 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Folder className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                          <span className="flex-1 truncate text-sm font-medium">
                            {basename(t.folder)}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {format_elapsed(t.openedAt)}
                          </span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-md break-all">
                        {t.folder}
                      </TooltipContent>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            </TooltipProvider>
          </div>
        )}

        <p className="text-xs text-muted-foreground">Or drop a tour folder here</p>
      </div>
    </div>
  );
}
