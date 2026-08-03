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
import { on } from "@/lib/electron";

interface UpdateInfo {
  currentVersion: string;
  newVersion: string;
}

interface UpdateCheckResult {
  app: UpdateInfo | null;
  cli: UpdateInfo | null;
}

// Shown once on startup when a newer version of the app and/or the CLI (PHAR)
// is available. Notification-only: it just points the user to Preferences,
// where the actual update buttons live. A single OK button closes it.
export function UpdateNotificationModal() {
  const [notification, setNotification] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    on<UpdateCheckResult>("update-check-notification", (payload) => {
      if (cancelled) return;
      if (payload.app || payload.cli) setNotification(payload);
    }).then((fn) => {
      if (cancelled) fn();
      else unsub = fn;
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const hasApp = !!notification?.app;
  const hasCli = !!notification?.cli;
  const title = hasApp && hasCli ? "Updates available" : "Update available";

  return (
    <Dialog
      open={!!notification}
      onOpenChange={(open) => {
        if (!open) setNotification(null);
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            A newer version is ready to install from Preferences.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {hasApp && (
            <p>
              KRpanoCode Studio <strong>v{notification?.app?.newVersion}</strong> is
              available (you have v{notification?.app?.currentVersion}).
            </p>
          )}
          {hasCli && (
            <p>
              KRpanoCode CLI <strong>v{notification?.cli?.newVersion}</strong> is
              available (you have v{notification?.cli?.currentVersion}).
            </p>
          )}
          <p className="text-muted-foreground">
            Open Preferences (the gear icon) and use the update buttons there to
            install the new version.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={() => setNotification(null)}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
