import { useEffect, useState } from "react";
import { invoke, on } from "@/lib/electron";
import { X, Download, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

interface ProgressInfo {
  bytesPerSecond: number;
  percent: number;
  total: number;
  transferred: number;
}

export function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribers: Array<() => void> = [];

    const setupListeners = async () => {
      unsubscribers = [
        await on<UpdateInfo>("update-available", (info) => {
          setUpdateAvailable(info);
          toast.info(`Update available: ${info.version}`);
        }),
        await on<ProgressInfo>("update-download-progress", (progressInfo) => {
          setProgress(progressInfo.percent);
        }),
        await on<UpdateInfo>("update-downloaded", (info) => {
          setIsDownloading(false);
          setIsInstalling(true);
          toast.success(`Update ${info.version} downloaded! Restart to apply.`);
        }),
        await on<string>("update-error", (err) => {
          setError(err);
          toast.error(`Update failed: ${err}`);
        }),
      ];
    };

    setupListeners();

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, []);

  const handleDownload = async () => {
    setIsDownloading(true);
    setError(null);
    try {
      await invoke("download_update");
    } catch (err) {
      setError(String(err));
      setIsDownloading(false);
    }
  };

  const handleInstall = async () => {
    setError(null);
    try {
      await invoke("install_update");
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDismiss = () => {
    setUpdateAvailable(null);
    setError(null);
  };

  if (!updateAvailable && !error) return null;

  return (
    <div className="border-b bg-muted/50 px-4 py-2 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-sm">
        {error ? (
          <>
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-destructive">Update failed: {error}</span>
          </>
        ) : updateAvailable ? (
          <>
            <RefreshCw className="h-4 w-4 text-primary" />
            <span>
              New version <strong>{updateAvailable.version}</strong> available
            </span>
            {isDownloading && (
              <span className="text-muted-foreground">
                ({progress.toFixed(0)}%)
              </span>
            )}
            {isInstalling && (
              <span className="text-muted-foreground">
                - restart to apply
              </span>
            )}
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {!isDownloading && !isInstalling && updateAvailable && (
          <Button size="sm" variant="default" onClick={handleDownload}>
            <Download className="h-3 w-3 mr-1" />
            Update Now
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={handleDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}