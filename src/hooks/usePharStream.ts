import { useEffect, useRef } from "react";
import { on } from "@/lib/electron";
import { useAppStore } from "@/stores/appStore";

export function usePharStream(): void {
  const applyPharEvent = useAppStore((s) => s.applyPharEvent);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const unlisten = await on("phar-event", (payload: unknown) => {
        applyPharEvent(payload as Parameters<typeof applyPharEvent>[0]);
      });
      if (!cancelled) {
        unlistenRef.current = unlisten;
      } else {
        unlisten();
      }
    })();
    return () => {
      cancelled = true;
      unlistenRef.current?.();
      unlistenRef.current = null;
    };
  }, [applyPharEvent]);
}
