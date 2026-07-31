import { create } from "zustand";
import type {
  ActivityEntry,
  DiffEntry,
  DiffEvent,
  Phase,
  PharEvent,
} from "@/lib/types";

export interface TourInfo {
  folder: string;
  name: string;
  previewUrl: string;
}

// Re-export for callers that import from the store.
export type { DiffEntry };

interface AppState {
  // --- phase / tour ---
  phase: Phase;
  tour: TourInfo | null;
  // --- tour edit metadata (from `start` events) ---
  backupPath: string | null;
  editable: string[];
  locked: string[];
  // --- activity log ---
  activity: ActivityEntry[];
  // --- diffs (keyed by file) ---
  diffs: DiffEntry[];
  // --- clarify ---
  clarifyQuestion: string | null;
  // --- error ---
  error: string | null;
  // --- models ---
  models: string[];
  selectedModel: string | null;
  // --- UI prefs ---
  theme: "light" | "dark" | "system";
  showReasoning: boolean;
  // --- prompt box ---
  lastPrompt: string;

  // --- actions ---
  setPhase: (p: Phase) => void;
  openTour: (folder: string, previewUrl: string) => void;
  closeTour: () => void;
  clearActivity: () => void;
  clearDiffs: () => void;
  setError: (msg: string | null) => void;
  setModels: (models: string[]) => void;
  setSelectedModel: (m: string | null) => void;
  setTheme: (t: "light" | "dark" | "system") => void;
  setShowReasoning: (b: boolean) => void;
  setLastPrompt: (p: string) => void;

  // The central event handler — dispatches any PHAR event into state changes.
  applyPharEvent: (ev: PharEvent) => void;
}

let _idCounter = 0;
const nextId = () => `a${++_idCounter}`;

function tourNameFromFolder(folder: string): string {
  const clean = folder.replace(/\/+$/, "");
  const idx = clean.lastIndexOf("/");
  return idx >= 0 ? clean.slice(idx + 1) : clean;
}

export const useAppStore = create<AppState>((set, get) => ({
  phase: "empty",
  tour: null,
  backupPath: null,
  editable: [],
  locked: [],
  activity: [],
  diffs: [],
  clarifyQuestion: null,
  error: null,
  models: [],
  selectedModel: null,
  theme: "system",
  showReasoning: false,
  lastPrompt: "",

  setPhase: (p) => set({ phase: p }),
  openTour: (folder, previewUrl) =>
    set({
      tour: { folder, name: tourNameFromFolder(folder), previewUrl },
      phase: "idle",
      activity: [],
      diffs: [],
      backupPath: null,
      editable: [],
      locked: [],
      clarifyQuestion: null,
      error: null,
    }),
  closeTour: () =>
    set({
      tour: null,
      phase: "empty",
      activity: [],
      diffs: [],
      backupPath: null,
      editable: [],
      locked: [],
      clarifyQuestion: null,
      error: null,
    }),
  clearActivity: () => set({ activity: [] }),
  clearDiffs: () => set({ diffs: [] }),
  setError: (msg) => set({ error: msg }),
  setModels: (models) => set({ models }),
  setSelectedModel: (m) => set({ selectedModel: m }),
  setTheme: (t) => set({ theme: t }),
  setShowReasoning: (b) => set({ showReasoning: b }),
  setLastPrompt: (p) => set({ lastPrompt: p }),

  applyPharEvent: (ev) => {
    const now = Date.now();
    const state = get();
    switch (ev.type) {
      case "start":
        set({
          phase: "working",
          backupPath: ev.backup,
          editable: ev.editable ?? [],
          locked: ev.locked ?? [],
          error: null,
          // New edit run — clear previous diffs so the new run's diffs are clean.
          diffs: [],
        });
        return;
      case "reasoning":
        if (!state.showReasoning) return;
        set({
          activity: [
            ...state.activity,
            {
              id: nextId(),
              kind: "reasoning",
              text: ev.text,
              timestamp: now,
            },
          ],
        });
        return;
      case "tool":
        set({
          activity: [
            ...state.activity,
            {
              id: nextId(),
              kind: "tool",
              toolName: ev.name,
              file: ev.file,
              query: ev.query,
              bytes: ev.bytes,
              ms: ev.ms,
              timestamp: now,
            },
          ],
        });
        return;
      case "clarify":
        if (ev.status === "clarify") {
          set({ phase: "clarify", clarifyQuestion: ev.question ?? "" });
        }
        // status:"clear" → no phase change, keep working.
        return;
      case "diff": {
        const d: DiffEvent = ev;
        // Replace any existing entry for the same file (last write wins).
        const others = state.diffs.filter((x) => x.file !== d.file);
        set({ diffs: [...others, { file: d.file, hunks: d.hunks }] });
        return;
      }
      case "restored":
        set({
          phase: "idle",
          diffs: [],
          clarifyQuestion: null,
        });
        return;
      case "done":
        // Move to review only if we actually got diffs; otherwise idle.
        set({ phase: state.diffs.length > 0 ? "review" : "idle" });
        return;
      case "error":
        set({ error: ev.message });
        // If we were mid-edit, fall back to review (so user can undo) when diffs exist.
        if (state.phase === "working") {
          set({ phase: state.diffs.length > 0 ? "review" : "idle" });
        }
        return;
      case "__stream_end__":
        // If the stream closed without an explicit `done`, still finalize.
        if (state.phase === "working") {
          set({ phase: state.diffs.length > 0 ? "review" : "idle" });
        }
        return;
      case "version":
      case "models":
      case "setup":
      case "stderr":
        // Not part of the streaming edit loop; handled by their invoking commands.
        return;
    }
  },
}));
