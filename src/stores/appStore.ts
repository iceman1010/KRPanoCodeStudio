import { create } from "zustand";
import type {
  ActivityEntry,
  DiffEntry,
  DiffEvent,
  ErrorEvent,
  Phase,
  PharEvent,
} from "@/lib/types";

export interface TourInfo {
  folder: string;
  name: string;
  previewUrl: string;
}

export interface RecentTour {
  folder: string;
  openedAt: number;
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
  // --- run timing (set when a prompt is submitted, cleared when the run ends) ---
  runStartedAt: number | null;
  // --- activity log ---
  activity: ActivityEntry[];
  // --- diffs (keyed by file) ---
  diffs: DiffEntry[];
  // --- clarify ---
  clarifyQuestion: string | null;
  // --- error ---
  error: string | null;
  // --- rate-limit (set when an error event has kind === "rate_limit") ---
  rateLimit: {
    model: string | null;
    resetAt: string | null;
    retryAfterSeconds: number | null;
  } | null;
  // --- models ---
  models: string[];
  selectedModel: string | null;
  modelsLoading: boolean;
  // --- UI prefs ---
  theme: "light" | "dark" | "system";
  showReasoning: boolean;
  // --- prompt box ---
  lastPrompt: string;
  lastClarify: boolean;
  // --- recent tours (quick links on the empty state) ---
  recentTours: RecentTour[];

  // --- actions ---
  setPhase: (p: Phase) => void;
  beginRun: () => void;
  endRun: (p: Phase) => void;
  openTour: (folder: string, previewUrl: string) => void;
  closeTour: () => void;
  clearActivity: () => void;
  clearDiffs: () => void;
  setError: (msg: string | null) => void;
  clearRateLimit: () => void;
  setModels: (models: string[]) => void;
  setSelectedModel: (m: string | null) => void;
  setModelsLoading: (b: boolean) => void;
  setTheme: (t: "light" | "dark" | "system") => void;
  setShowReasoning: (b: boolean) => void;
  setLastPrompt: (p: string, clarify: boolean) => void;
  setRecentTours: (tours: RecentTour[]) => void;

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
  runStartedAt: null,
  tour: null,
  backupPath: null,
  editable: [],
  locked: [],
  activity: [],
  diffs: [],
  clarifyQuestion: null,
  error: null,
  rateLimit: null,
  models: [],
  selectedModel: null,
  modelsLoading: true,
  theme: "system",
  showReasoning: false,
  lastPrompt: "",
  lastClarify: false,
  recentTours: [],

  setPhase: (p) => set({ phase: p }),
  beginRun: () => set({ phase: "working", runStartedAt: Date.now() }),
  endRun: (p) => set({ phase: p, runStartedAt: null }),
  openTour: (folder, previewUrl) =>
    set({
      tour: { folder, name: tourNameFromFolder(folder), previewUrl },
      phase: "idle",
      activity: [],
      diffs: [],
      backupPath: null,
      editable: [],
      locked: [],
      runStartedAt: null,
      clarifyQuestion: null,
      error: null,
      rateLimit: null,
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
      runStartedAt: null,
      clarifyQuestion: null,
      error: null,
      rateLimit: null,
    }),
  clearActivity: () => set({ activity: [] }),
  clearDiffs: () => set({ diffs: [] }),
  setError: (msg) => set({ error: msg }),
  clearRateLimit: () => set({ rateLimit: null }),
  setModels: (models) => set({ models }),
  setSelectedModel: (m) => set({ selectedModel: m }),
  setModelsLoading: (b) => set({ modelsLoading: b }),
  setTheme: (t) => set({ theme: t }),
  setShowReasoning: (b) => set({ showReasoning: b }),
  setLastPrompt: (p, clarify) => set({ lastPrompt: p, lastClarify: clarify }),
  setRecentTours: (tours) => set({ recentTours: tours }),

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
          runStartedAt: null,
        });
        return;
      case "done":
        // Move to review only if we actually got diffs; otherwise idle.
        set({ phase: state.diffs.length > 0 ? "review" : "idle", runStartedAt: null });
        return;
      case "error": {
        const evTyped = ev as ErrorEvent;
        // Rate-limit 429: stash structured fields so the UI can show a
        // countdown + Retry button instead of just the message.
        const rl =
          evTyped.kind === "rate_limit"
            ? {
                model: evTyped.model ?? null,
                resetAt: evTyped.reset_at ?? null,
                retryAfterSeconds: evTyped.retry_after_seconds ?? null,
              }
            : null;
        set({ error: evTyped.message, rateLimit: rl });
        // If we were mid-edit or mid-clarify, fall back to review (so user can
        // undo) when diffs exist, otherwise idle. Without the clarify branch
        // here, a stream that dies while the user is typing an answer would
        // leave the UI stuck on the clarify panel forever.
        if (state.phase === "working" || state.phase === "clarify") {
          set({
            phase: state.diffs.length > 0 ? "review" : "idle",
            runStartedAt: null,
            clarifyQuestion: null,
          });
        }
        return;
      }
      case "__stream_end__":
        // If the stream closed without an explicit `done`, still finalize.
        // Cover the clarify phase too: the PHAR may exit cleanly mid-clarify
        // (the multi-round clarify bug) and we must not strand the UI.
        if (state.phase === "working" || state.phase === "clarify") {
          set({
            phase: state.diffs.length > 0 ? "review" : "idle",
            runStartedAt: null,
            clarifyQuestion: null,
          });
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
