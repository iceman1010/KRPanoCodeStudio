import { useState } from "react";
import { Settings, FolderOpen, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { invoke } from "@/lib/electron";
import { useAppStore } from "@/stores/appStore";
import { toast } from "sonner";

interface TopBarProps {
  onOpenSettings: () => void;
}

const PHASE_DOT: Record<string, string> = {
  empty: "bg-muted-foreground",
  idle: "bg-emerald-500",
  working: "bg-amber-500 animate-pulse",
  review: "bg-sky-500",
  clarify: "bg-violet-500 animate-pulse",
};

export function TopBar({ onOpenSettings }: TopBarProps) {
  const tour = useAppStore((s) => s.tour);
  const phase = useAppStore((s) => s.phase);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const openTour = useAppStore((s) => s.openTour);
  const closeTour = useAppStore((s) => s.closeTour);
  const [busy, setBusy] = useState(false);

  async function pickFolder() {
    setBusy(true);
    try {
      const folder = await invoke<string | null>("pick_folder");
      if (!folder) return;
      const previewUrl = await invoke<string>("open_tour", folder);
      openTour(folder, previewUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="flex h-12 items-center gap-3 border-b bg-background px-4">
      <div className="flex items-center gap-2 font-semibold">
        <span className="text-base">KRpanoCode Studio</span>
      </div>
      <div className="flex items-center gap-1.5" title={`Status: ${phase}`}>
        <Circle className={`h-2.5 w-2.5 fill-current ${PHASE_DOT[phase] ?? ""}`} />
      </div>
      <div className="flex-1" />
      {tour && (
        <>
          <Badge variant="secondary" className="max-w-[280px] truncate">
            {tour.name}
          </Badge>
          <Button variant="ghost" size="sm" onClick={pickFolder} disabled={busy}>
            <FolderOpen className="mr-1.5 h-4 w-4" />
            Open…
          </Button>
          <Button variant="ghost" size="sm" onClick={() => closeTour()}>
            Close
          </Button>
        </>
      )}
      {selectedModel && (
        <Badge variant="outline">{selectedModel}</Badge>
      )}
      <Button variant="ghost" size="icon" onClick={onOpenSettings} title="Settings">
        <Settings className="h-4 w-4" />
      </Button>
    </header>
  );
}
