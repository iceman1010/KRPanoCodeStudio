import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { invoke, on } from "@/lib/electron";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, ExternalLink, Loader2 } from "lucide-react";

export type CliIssue = "no_phar" | "no_php";

interface CliMissingModalProps {
  issue: CliIssue | null;
  // Called after the CLI was successfully downloaded + installed.
  onFixed: () => void;
}

interface DownloadProgress {
  phase: "resolve" | "download" | "verify" | "done";
  received?: number;
  total?: number;
  version?: string;
}

type DlState =
  | { state: "idle" }
  | { state: "downloading"; pct: number; label: string }
  | { state: "error"; message: string };

// Shown when the main process reports (via check_backend) that the CLI engine
// cannot run. no_phar → offer a one-click download of the latest krpanocode.phar
// from GitHub. no_php → the app installation itself is incomplete (PHP runtime
// is bundled with the installer); point the user at the releases page.
// The dialog is intentionally non-dismissible: without a CLI the app can do
// nothing useful, so there is no "close and ignore" path.
export function CliMissingModal({ issue, onFixed }: CliMissingModalProps) {
  const [dl, setDl] = useState<DlState>({ state: "idle" });

  // Subscribe to download progress events only while a download is active.
  useEffect(() => {
    if (issue !== "no_phar") return;
    let disposed = false;
    let unsub: (() => void) | undefined;
    on<DownloadProgress>("cli-download-progress", (p) => {
      if (disposed) return;
      if (p.phase === "resolve") {
        setDl({ state: "downloading", pct: 0, label: "Resolving latest release…" });
      } else if (p.phase === "download") {
        const total = p.total ?? 0;
        const pct = total > 0 ? Math.min(100, Math.round(((p.received ?? 0) / total) * 100)) : 0;
        const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
        setDl({
          state: "downloading",
          pct,
          label: total > 0 ? `${mb(p.received ?? 0)} / ${mb(total)} MB (${pct}%)` : "Downloading…",
        });
      } else if (p.phase === "verify") {
        setDl({ state: "downloading", pct: 100, label: "Verifying download…" });
      } else if (p.phase === "done") {
        setDl({ state: "idle" });
        toast.success(`CLI v${p.version} installed`);
        onFixed();
      }
    }).then((fn) => {
      if (disposed) fn();
      else unsub = fn;
    });
    return () => {
      disposed = true;
      unsub?.();
    };
  }, [issue, onFixed]);

  async function startDownload() {
    setDl({ state: "downloading", pct: 0, label: "Resolving latest release…" });
    try {
      await invoke<string>("download_cli");
      // Success path is handled by the "done" progress event (toast + onFixed).
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDl({ state: "error", message });
    }
  }

  const busy = dl.state === "downloading";

  return (
    <Dialog
      open={!!issue}
      onOpenChange={() => {
        // Non-dismissible: without a CLI the app is useless, so ESC/overlay
        // close attempts are ignored.
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {issue === "no_php" ? "App installation incomplete" : "CLI engine missing"}
          </DialogTitle>
          <DialogDescription>
            {issue === "no_php"
              ? "The PHP runtime that ships with KRpanoCode Studio could not be found, and no system PHP is installed."
              : "The krpanocode CLI (krpanocode.phar) could not be found on this machine."}
          </DialogDescription>
        </DialogHeader>

        {issue === "no_php" ? (
          <div className="space-y-3 text-sm">
            <p>
              The app needs its bundled PHP runtime to run the CLI engine. It is
              part of the installer, so if it is missing your installation is
              damaged or was blocked (for example by antivirus software).
            </p>
            <p className="text-muted-foreground">
              Please reinstall KRpanoCode Studio from the releases page. If your
              antivirus quarantined files, add an exception for the app folder
              first.
            </p>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p>
              The CLI engine powers every edit this app makes. It can be
              downloaded automatically from GitHub and installed to the app
              data folder — no extra setup needed.
            </p>
            {busy && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {dl.state === "downloading" ? dl.label : ""}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${dl.state === "downloading" ? dl.pct : 0}%` }}
                  />
                </div>
              </div>
            )}
            {dl.state === "error" && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>{dl.message}</div>
                </div>
              </div>
            )}
            {dl.state === "idle" && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Download size is a few megabytes.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {issue === "no_php" ? (
            <Button
              onClick={() => invoke("open_external", "https://github.com/iceman1010/KRpanoCodeStudio/releases")}
            >
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Open releases page
            </Button>
          ) : (
            <Button onClick={startDownload} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Downloading…
                </>
              ) : (
                <>
                  <Download className="mr-1.5 h-4 w-4" />
                  {dl.state === "error" ? "Retry download" : "Download CLI"}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
