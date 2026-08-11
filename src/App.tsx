import { useCallback, useEffect, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TopBar } from "@/components/TopBar";
import { Preview } from "@/components/Preview";
import { UpdateNotificationModal } from "@/components/UpdateNotificationModal";
import { IdleTimeoutModal } from "@/components/IdleTimeoutModal";
import { RightPanel } from "@/components/right-panel/RightPanel";
import { EmptyState } from "@/states/EmptyState";
import { SettingsModal } from "@/modals/SettingsModal";
import { EditDiffLineModal } from "@/modals/EditDiffLineModal";
import { HelpModal } from "@/components/HelpModal";
import { SplashScreen } from "@/components/SplashScreen";
import { useAppStore } from "@/stores/appStore";
import { usePharStream } from "@/hooks/usePharStream";
import { invoke, on } from "@/lib/electron";

const APP_VERSION = __APP_VERSION__;

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
  const setAutoApproveFileScope = useAppStore((s) => s.setAutoApproveFileScope);
  const setModelsLoading = useAppStore((s) => s.setModelsLoading);
  const setModelsLoadFailed = useAppStore((s) => s.setModelsLoadFailed);
  const setRecentTours = useAppStore((s) => s.setRecentTours);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Single-flight guard: at most one loadModels is in-flight at a time.
  // A second call (e.g. system_resume firing during startup) sees the ref
  // populated and returns immediately — the in-flight call's store writes
  // win, and the second call would have fetched identical data anyway.
  // The ref is cleared in finally so a later genuine trigger can run fresh.
  // This is OS-agnostic and eliminates the store-clobbering race that
  // powerMonitor resume bursts were causing on Linux logind.
  const loadModelsInFlight = useRef<Promise<void> | null>(null);

  const loadModels = useCallback(async () => {
    if (loadModelsInFlight.current) return;
    const p = (async () => {
      try {
        const models = await invoke<string[]>("list_models");
        setModels(models);
        setModelsLoadFailed(false);
        const savedModel = await invoke<string | null>("get_preference", "selectedModel");
        if (models.length > 0 && !savedModel) {
          setSelectedModel(models[0]);
        }
      } catch (err) {
        console.error("Failed to load models:", err);
        setModelsLoadFailed(true);
      } finally {
        setModelsLoading(false);
        loadModelsInFlight.current = null;
      }
    })();
    loadModelsInFlight.current = p;
    await p;
  }, [setModels, setModelsLoadFailed, setSelectedModel, setModelsLoading]);

  // Ref so the system_resume handler can always call the latest loadModels
  // without re-subscribing the ipc listener on every identity change.
  const loadModelsRef = useRef(loadModels);
  useEffect(() => {
    loadModelsRef.current = loadModels;
  }, [loadModels]);

  // Load saved preferences and models on startup
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const selectedModel = await invoke<string | null>("get_preference", "selectedModel");
        if (selectedModel) setSelectedModel(selectedModel);
        const autoApprove = await invoke<boolean | null>("get_preference", "autoApproveFileScope");
        if (autoApprove !== null) setAutoApproveFileScope(autoApprove);
        const recent = await invoke<{ folder: string; openedAt: number }[] | null>(
          "get_preference",
          "recentTours",
        );
        if (Array.isArray(recent)) setRecentTours(recent);
      } catch (err) {
        console.error("Failed to load preferences:", err);
      }
    };

    Promise.all([loadPreferences(), loadModels()]);
  }, [loadModels, setSelectedModel, setAutoApproveFileScope, setModels, setRecentTours]);

  // System resume (post-hibernation): re-fetch models. The main process
  // probes DNS before spawning the PHAR, so we can safely re-fire here.
  // Mount-only subscription — loadModelsRef holds the latest callback.
  // Race-free cleanup handles on() Promise resolving before/after unmount.
  useEffect(() => {
    let disposed = false;
    let unsub: (() => void) | undefined;
    on("system_resume", () => {
      if (!disposed) loadModelsRef.current();
    }).then((u) => {
      if (disposed) u();
      else unsub = u;
    });
    return () => {
      disposed = true;
      if (unsub) unsub();
    };
  }, []);

  if (!tour) {
    return (
      <TooltipProvider>
        <div className="flex h-screen flex-col bg-background text-foreground">
          <SplashScreen version={APP_VERSION} />
          <TopBar onOpenSettings={() => setSettingsOpen(true)} onOpenHelp={() => setHelpOpen(true)} />
          <EmptyState />
          <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
          <EditDiffLineModal />
          <HelpModal open={helpOpen} onOpenChange={setHelpOpen} />
          <UpdateNotificationModal />
          <IdleTimeoutModal />
          <Toaster richColors position="bottom-right" />
        </div>
      </TooltipProvider>
    );
  }

  return (
      <TooltipProvider>
        <div className="flex h-screen flex-col bg-background text-foreground">
          <SplashScreen version={APP_VERSION} />
          <TopBar onOpenSettings={() => setSettingsOpen(true)} onOpenHelp={() => setHelpOpen(true)} />
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
          <EditDiffLineModal />
        <HelpModal open={helpOpen} onOpenChange={setHelpOpen} />
        <UpdateNotificationModal />
          <IdleTimeoutModal />
        <Toaster richColors position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}
