import { useEffect, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TopBar } from "@/components/TopBar";
import { Preview } from "@/components/Preview";
import { UpdateNotificationModal } from "@/components/UpdateNotificationModal";
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
  const setModelsLoading = useAppStore((s) => s.setModelsLoading);
  const setRecentTours = useAppStore((s) => s.setRecentTours);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Load saved preferences and models on startup
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const selectedModel = await invoke<string | null>("get_preference", "selectedModel");
        if (selectedModel) setSelectedModel(selectedModel);
        const recent = await invoke<{ folder: string; openedAt: number }[] | null>(
          "get_preference",
          "recentTours",
        );
        if (Array.isArray(recent)) setRecentTours(recent);
      } catch (err) {
        console.error("Failed to load preferences:", err);
      }
    };

    const loadModels = async () => {
      try {
        const models = await invoke<string[]>("list_models");
        setModels(models);

        // Set initial model if none saved
        const savedModel = await invoke<string | null>("get_preference", "selectedModel");
        if (models.length > 0 && !savedModel) {
          setSelectedModel(models[0]);
        }
      } catch (err) {
        console.error("Failed to load models:", err);
      } finally {
        setModelsLoading(false);
      }
    };

    Promise.all([loadPreferences(), loadModels()]);
  }, [setSelectedModel, setModels, setModelsLoading, setRecentTours]);

  if (!tour) {
    return (
      <TooltipProvider>
        <div className="flex h-screen flex-col bg-background text-foreground">
          <TopBar onOpenSettings={() => setSettingsOpen(true)} />
          <EmptyState />
          <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
          <UpdateNotificationModal />
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
        <UpdateNotificationModal />
        <Toaster richColors position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}
