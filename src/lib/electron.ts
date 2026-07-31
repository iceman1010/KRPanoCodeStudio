// IPC bridge: wraps window.electronAPI (exposed by preload.cjs contextBridge).
// Drop-in replacement for the old @/lib/tauri.ts — same invoke/on API shape
// so components don't need to change.

export function isElectron(): boolean {
  return typeof window !== "undefined" && "electronAPI" in window;
}

export async function invoke<T = unknown>(cmd: string, ...args: unknown[]): Promise<T> {
  if (!isElectron()) {
    throw new Error(
      `invoke("${cmd}") called outside Electron. Run "npm run dev" instead.`,
    );
  }
  return (window as any).electronAPI.invoke(cmd, ...args) as Promise<T>;
}

export async function on<T = unknown>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  if (!isElectron()) {
    return () => {};
  }
  return (window as any).electronAPI.on(event, handler) as () => void;
}
