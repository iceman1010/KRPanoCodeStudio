import { create } from "zustand";
import type {
  ActivityEntry,
  ConversationTurn,
  DiffEntry,
  DiffEvent,
  ErrorEvent,
  LastEdit,
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
  modelsLoadFailed: boolean;
  // --- UI prefs ---
  theme: "light" | "dark" | "system";
  showReasoning: boolean;
  // --- prompt box ---
  lastPrompt: string;
  lastClarify: boolean;
  // --- last edit snapshot (for Resume after transient failure) ---
  // Kept in-memory only — lost on app restart. Cleared on `done` or new prompt.
  lastEdit: LastEdit | null;
  // Subset of lastEdit promoted to "resumable" state when a transient 5xx
  // killed the run. Set on `error` events where httpCode >= 500 and lastEdit
  // matches the current tour; cleared by beginEdit / done / openTour /
  // closeTour / a successful resume. Decoupled from `error` so dismissing the
  // error message does not drop the Resume button.
  failedEdit: LastEdit | null;
  // Best-effort capture of the most recent clarify answer. The CLI's clarify
  // loop is multi-round; we want the LAST user_answer merged into the resume
  // instruction. Reset to null at the start of each run (`beginRun`).
  pendingClarifyAnswer: string | null;
  // --- conversation log ---
  conversation: ConversationTurn[];
  addConversationTurn: (turn: ConversationTurn) => void;
  clearConversation: () => void;

  // --- recent tours (quick links on the empty state) ---
  recentTours: RecentTour[];

  // --- actions ---
  setPhase: (p: Phase) => void;
  beginRun: () => void;
  endRun: (p: Phase) => void;
  // Seed the last-edit snapshot when a prompt is sent so a Resume button can
  // re-issue the same intent after a transient 524/5xx failure. Caller passes
  // the full run descriptor (prompt, clarify mode, model, folder).
  beginEdit: (edit: Omit<LastEdit, "startedAt" | "clarifyAnswer">) => void;
  // Re-issue the last edit as a fresh prompt. Returns the merged instruction
  // string the caller should pass to send_prompt, or null when there is
  // nothing to resume (no lastEdit, or the tour folder changed).
  resumeLastEdit: () => string | null;
  openTour: (folder: string, previewUrl: string) => void;
  closeTour: () => void;
  clearActivity: () => void;
  clearDiffs: () => void;
  setError: (msg: string | null) => void;
  clearRateLimit: () => void;
  setModels: (models: string[]) => void;
  setSelectedModel: (m: string | null) => void;
  setModelsLoading: (b: boolean) => void;
  setModelsLoadFailed: (b: boolean) => void;
  setTheme: (t: "light" | "dark" | "system") => void;
  setShowReasoning: (b: boolean) => void;
  setLastPrompt: (p: string, clarify: boolean) => void;
  setRecentTours: (tours: RecentTour[]) => void;
  // Attach the most recent user clarify answer to the in-flight lastEdit
  // snapshot so a Resume after a transient failure can re-issue the same
  // merged intent. No-op when there is no in-flight lastEdit (e.g. user typed
  // an answer to a previous run's stale event).
  setLastClarifyAnswer: (answer: string) => void;

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
  modelsLoadFailed: false,
  // --- conversation log ---
  conversation: [],
  // --- UI prefs ---
  theme: "system",
  showReasoning: false,
  lastPrompt: "",
  lastClarify: false,
  // --- resume-after-failure snapshot (in-memory only) ---
  lastEdit: null,
  failedEdit: null,
  pendingClarifyAnswer: null,
  recentTours: [],

  setPhase: (p) => set({ phase: p }),
  beginRun: () => set({ phase: "working", runStartedAt: Date.now() }),
  endRun: (p) => set({ phase: p, runStartedAt: null }),
  // Seed lastEdit at the start of a run. pendingClarifyAnswer is reset so a
  // leftover answer from a previous run can't bleed into this one. The
  // clarifyAnswer field on lastEdit is filled in later by applyPharEvent when
  // the user actually answers (status:"clear" or a user_clarify_answer turn).
  // failedEdit is cleared too — a new prompt invalidates any prior Resume.
  beginEdit: (edit) =>
    set({
      lastEdit: { ...edit, startedAt: Date.now(), clarifyAnswer: null },
      failedEdit: null,
      pendingClarifyAnswer: null,
    }),
  // Build the merged instruction for a resumed edit. Returns null when there
  // is nothing to resume, or when the currently-open tour doesn't match the
  // one the failed edit targeted (don't resume an edit on the wrong tour).
  // Clears failedEdit so the Resume banner doesn't linger after firing.
  resumeLastEdit: () => {
    const s = get();
    const e = s.failedEdit ?? s.lastEdit;
    if (!e || !s.tour) return null;
    if (s.tour.folder !== e.tourFolder) return null;
    set({ failedEdit: null });
    return e.clarifyAnswer
      ? `${e.prompt}\n\nFollow-up clarification: ${e.clarifyAnswer}`
      : e.prompt;
  },
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
      lastEdit: null,
      failedEdit: null,
      pendingClarifyAnswer: null,
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
      lastEdit: null,
      failedEdit: null,
      pendingClarifyAnswer: null,
    }),
  clearActivity: () => set({ activity: [] }),
  clearDiffs: () => set({ diffs: [] }),
  setError: (msg) => set({ error: msg }),
  clearRateLimit: () => set({ rateLimit: null }),
  setModels: (models) => set({ models }),
  setSelectedModel: (m) => set({ selectedModel: m }),
  setModelsLoading: (b) => set({ modelsLoading: b }),
  setModelsLoadFailed: (b) => set({ modelsLoadFailed: b }),
  setTheme: (t) => set({ theme: t }),
  setShowReasoning: (b) => set({ showReasoning: b }),
  setLastPrompt: (p, clarify) => set({ lastPrompt: p, lastClarify: clarify }),
  setRecentTours: (tours) => set({ recentTours: tours }),
  setLastClarifyAnswer: (answer) => {
    // Best-effort: only attach if lastEdit exists and is for the current tour.
    const s = get();
    if (!s.lastEdit || !s.tour || s.tour.folder !== s.lastEdit.tourFolder) return;
    set({ lastEdit: { ...s.lastEdit, clarifyAnswer: answer } });
  },
  // conversation log
  addConversationTurn: (turn) => set((s) => ({ conversation: [...s.conversation, turn] })),
  clearConversation: () => set({ conversation: [] }),

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
        get().addConversationTurn({ kind: "model_done", timestamp: now });
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
        get().addConversationTurn({ kind: "model_reasoning", text: ev.text, timestamp: now });
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
        get().addConversationTurn({
          kind: "model_tool",
          toolName: ev.name,
          file: ev.file,
          query: ev.query,
          bytes: ev.bytes,
          ms: ev.ms,
          timestamp: now,
        });
        return;
      case "clarify":
        if (ev.status === "clarify") {
          set({ phase: "clarify", clarifyQuestion: ev.question ?? "" });
          if (ev.question) {
            get().addConversationTurn({ kind: "model_clarify_question", text: ev.question, timestamp: now });
          }
        } else if (ev.status === "clear" && typeof ev.reason === "string") {
          // AI restated the user's intent as the merged instruction; record it
          // in the log so the conversation reads naturally. The user's literal
          // answer (preserved separately in lastEdit.clarifyAnswer) is what we
          // use for resume, not this restatement.
          get().addConversationTurn({ kind: "model_clarify_clear", reason: ev.reason, timestamp: now });
        }
        // status:"clear" → no phase change, keep working.
        return;
      case "retry": {
        // PHAR is retrying the upstream HTTP call after a transient failure
        // (524 etc.). Surface in the activity log + conversation log so the
        // user sees "Retrying (2/3) in 4s…" rather than a silent gap. Don't
        // touch phase: we're still "working".
        const r = ev as unknown as {
          attempt: number; maxAttempts: number; httpCode: number;
          delayMs: number; reason: string;
        };
        get().addConversationTurn({
          kind: "model_retry",
          attempt: r.attempt,
          maxAttempts: r.maxAttempts,
          httpCode: r.httpCode,
          delayMs: r.delayMs,
          reason: r.reason,
          timestamp: now,
        });
        return;
      }
      case "diff": {
        const d: DiffEvent = ev;
        // Replace any existing entry for the same file (last write wins).
        const others = state.diffs.filter((x) => x.file !== d.file);
        set({ diffs: [...others, { file: d.file, hunks: d.hunks }] });
        get().addConversationTurn({ kind: "model_diff", file: d.file, hunks: d.hunks, timestamp: now });
        return;
      }
      case "restored":
        set({
          phase: "idle",
          diffs: [],
          clarifyQuestion: null,
          runStartedAt: null,
        });
        get().addConversationTurn({ kind: "model_restored", files: ev.files, timestamp: now });
        return;
      case "done":
        // Move to review only if we actually got diffs; otherwise idle.
        set({
          phase: state.diffs.length > 0 ? "review" : "idle",
          runStartedAt: null,
          // Clean exit — drop the resume snapshot so a stale Resume button
          // can't appear after a successful edit.
          lastEdit: null,
          failedEdit: null,
        });
        get().addConversationTurn({ kind: "model_done", ms: ev.ms, timestamp: now });
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
        // Resumable = transient 5xx/gateway failure AND we have a lastEdit
        // snapshot to resume from. CLI sends http_code when it knows it; fall
        // back to scraping the message for "HTTP NNN" when it doesn't (older
        // PHARs). 429 (rate_limit) is its own flow with its own Retry button —
        // not resumable here.
        const httpCode =
          evTyped.http_code ??
          (evTyped.kind === "rate_limit"
            ? 429
            : (() => {
                const m = /HTTP (\d+)/.exec(evTyped.message);
                return m ? Number(m[1]) : null;
              })());
        const isTransient = httpCode !== null && httpCode >= 500 && httpCode < 600;
        const canResume =
          evTyped.kind !== "rate_limit" &&
          isTransient &&
          !!state.lastEdit &&
          // Don't offer resume on the wrong tour.
          !!state.tour &&
          state.tour.folder === state.lastEdit.tourFolder;
        // Promote lastEdit → failedEdit so the Resume banner survives the
        // user dismissing the error text below. Skipped when the error isn't
        // resumable (then failedEdit stays null and no banner appears).
        const failedEdit = canResume ? state.lastEdit : state.failedEdit;
        set({ error: evTyped.message, rateLimit: rl, failedEdit });
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
        get().addConversationTurn({
          kind: "model_error",
          message: evTyped.message,
          resumable: canResume,
          httpCode: httpCode ?? undefined,
          retryAttempts: evTyped.retry_attempts,
          timestamp: now,
        });
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
