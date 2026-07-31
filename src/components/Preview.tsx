import { useCallback, useState } from "react";
import { RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/appStore";
import { usePreviewReload } from "@/hooks/usePreviewReload";
import { invoke } from "@/lib/electron";

export function Preview() {
  const tour = useAppStore((s) => s.tour);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
    setLoading(true);
  }, []);

  usePreviewReload(reload);

  if (!tour) return null;

  return (
    <div className="relative flex h-full w-full flex-col bg-neutral-950">
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <Button
          variant="secondary"
          size="icon"
          onClick={reload}
          title="Reload preview"
          className="h-8 w-8 bg-background/80 backdrop-blur"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => invoke("open_external", tour.previewUrl).catch(() => {})}
          title="Open in browser"
          className="h-8 w-8 bg-background/80 backdrop-blur"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>

      {loading && (
        <div className="absolute inset-0 z-0 flex items-center justify-center text-neutral-500">
          <div className="flex items-center gap-2 text-sm">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading tour…
          </div>
        </div>
      )}

      <iframe
        key={reloadKey}
        src={tour.previewUrl}
        title="KRPano tour preview"
        className="h-full w-full flex-1 border-0"
        onLoad={() => setLoading(false)}
        allowFullScreen
        allow="fullscreen; accelerometer; gyroscope; magnetometer; xr-spatial-tracking"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-pointer-lock"
        referrerPolicy="origin"
      />
    </div>
  );
}
