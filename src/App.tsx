import { useEffect, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TopBar } from "@/components/TopBar";
import { Preview } from "@/components/Preview";
import { RightPanel } from "@/components/right-panel/RightPanel";
import { EmptyState } from "@/states/EmptyState";
import { SettingsModal } from "@/modals/SettingsModal";
import { useAppStore } from "@/stores/appStore";
import { usePharStream } from "@/hooks/usePharStream";
import { invoke } from "@/lib/electron";

function useApplyTheme() {
  const theme = useAppStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    const apply = (dark: boolean) => { root.classList.toggle("dark", dark); };
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      apply(mq.matches);
      const handler = (e: MediaQueryListEvent) => apply(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    apply(theme === "dark");
  }, [theme]);
}

export default function App() {
  usePharStream();
  useApplyTheme();

  const tour = useAppStore((s) => s.tour);
  const setModels = useAppStore((s) => s.setModels);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Load saved preferences on startup
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const selectedModel = await invoke<string | null>("get_preference", "selectedModel");
        if (selectedModel) setSelectedModel(selectedModel);
      } catch (err) {
        console.error("Failed to load preferences:", err);
      }
    };
    loadPreferences();
  }, [setSelectedModel]);

  if (!tour) {
    return (
      <TooltipProvider>
        <div className="flex h-screen flex-col bg-background text-foreground">
          <TopBar onOpenSettings={() => setSettingsOpen(true)} />
          <EmptyState />
          <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
          <Toaster richColors position="bottom-right" />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <TopBar onOpenSettings={() => setSettingsOpen(true)} />
        <div className="flex-1 overflow-hidden">
          <Group orientation="horizontal" style={{ height: "100%" }}>
            <Panel defaultSize="60%" minSize="40%" style={{ overflow: "hidden" }}>
              <Preview />
            </Panel>
            <Separator
              style={{
                width: "1px",
                background: "var(--border)",
                flexShrink: 0,
                cursor: "col-resize",
              }}
            />
            <Panel defaultSize={400} minSize={320} maxSize={600} style={{ overflow: "hidden" }}>
              <RightPanel />
            </Panel>
          </Group>
        </div>
        <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
        <Toaster richColors position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}
