import { useState } from "react";
import { Globe, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invoke } from "@/lib/electron";
import { useAppStore } from "@/stores/appStore";
import { toast } from "sonner";

export function EmptyState() {
  const openTour = useAppStore((s) => s.openTour);
  const [busy, setBusy] = useState(false);

  async function pickFolder() {
    setBusy(true);
    try {
      const folder = await invoke<string | null>("pick_folder");
      if (!folder) return;
      const previewUrl = await invoke<string>("open_tour", folder);
      openTour(folder, previewUrl);
      toast.success("Tour loaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/30">
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Globe className="h-10 w-10" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Open a KRPano tour</h2>
          <p className="text-sm text-muted-foreground">
            Pick a tour folder containing <code className="rounded bg-muted px-1">index.html</code> and your tour XML.
          </p>
        </div>
        <Button size="lg" onClick={pickFolder} disabled={busy}>
          <FolderOpen className="mr-2 h-4 w-4" />
          {busy ? "Loading…" : "Choose folder…"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Or drop a tour folder here
        </p>
      </div>
    </div>
  );
}
