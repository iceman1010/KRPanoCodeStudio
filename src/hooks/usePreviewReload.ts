import { useEffect, useRef } from "react";
import { on } from "@/lib/electron";

export function usePreviewReload(onReload: () => void): void {
  const cbRef = useRef(onReload);
  cbRef.current = onReload;

  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    (async () => {
      const unlisten = await on("preview-reload", () => {
        cbRef.current();
      });
      if (!cancelled) {
        unlistenFn = unlisten;
      } else {
        unlisten();
      }
    })();

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, []);
}
