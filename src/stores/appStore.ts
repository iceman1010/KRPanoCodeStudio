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
  UsageEvent,
  UsageSummaryEvent,
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
  autoApproveFileScope: boolean;
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
  // Validation retry state: set when the CLI emits validation_retry status:"ask"
  // (LLM produced invalid XML). The UI shows a banner with Retry/Abort buttons.
  // Cleared on "retry"/"abort"/done/error/new-run.
  validationRetry: {
    message: string;
    file?: string;
    line?: number | null;
    details?: { line: number; message: string }[];
    attempt: number;
    maxAttempts: number;
  } | null;
  // Plan-files state: set when the CLI emits plan_files status:"ask" (the LLM
  // called the plan_files tool and is waiting for the user to approve the
  // bulk pre-read). The UI shows an amber banner with Approve/Decline buttons.
  // Cleared on "yes"/"no"/done/error/new-run/stream-end.
  planFiles: {
    files: string[];
    reason: string;
  } | null;
  // Manual diff-hunk edit: set when the user clicks a green (added) line in
  // the DiffViewer to open the EditDiffLineModal. Holds enough context to
  // load the affected line range from disk and, after save, mutate the
  // matching hunk's `new` field in `diffs` so the viewer reflects the edit.
  // Cleared on modal close / save / Keep / Undo / new-run.
  editingHunk: {
    file: string;
    line: number;     // 1-based, first line of the hunk in the NEW file
    count: number;    // how many lines the hunk spans in the NEW file
    hunkIndex: number;  // index into diffs[file].hunks
  } | null;
  // --- token usage (accumulated during a run) ---
  // Per-API-call usage events for the current run, in arrival order. Lets the
  // ActivityLog render a row per API response (clarify/edit/retry) as it lands.
  // Cleared on beginRun/openTour/closeTour.
  usageEvents: UsageEvent[];
  // Final aggregated usage summary emitted near the end of a run (before
  // `done`). Carries the full breakdown across clarify/edit/retries +
  // grand_total. Null until the `usage_summary` event arrives.
  usageSummary: UsageSummaryEvent | null;
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
  setAutoApproveFileScope: (b: boolean) => void;
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
  // Open the EditDiffLineModal for a specific hunk. After the modal saves,
  // the caller uses `applyHunkEdit` to splice the edited text into both the
  // on-disk file (via write_file IPC) and the store's `diffs` array.
  setEditingHunk: (target: {
    file: string;
    line: number;
    count: number;
    hunkIndex: number;
  } | null) => void;
  // After the EditDiffLineModal saves the file on disk, update the matching
  // hunk's `new` field in `diffs` so the DiffViewer reflects the manual edit.
  applyHunkEdit: (file: string, hunkIndex: number, newNew: string) => void;
  // Accumulate a per-API-call usage event for the current run.
  addUsageEvent: (usage: UsageEvent) => void;
  // Set the final usage summary at the end of a run.
  setUsageSummary: (summary: UsageSummaryEvent | null) => void;

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
  autoApproveFileScope: false,
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
  validationRetry: null,
  planFiles: null,
  editingHunk: null,
  usageEvents: [],
  usageSummary: null,
  recentTours: [],

  setPhase: (p) => set({ phase: p }),
  beginRun: () => set({ phase: "working", runStartedAt: Date.now(), editingHunk: null, usageEvents: [], usageSummary: null }),
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
      validationRetry: null,
      planFiles: null,
      editingHunk: null,
      usageEvents: [],
      usageSummary: null,
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
      validationRetry: null,
      planFiles: null,
      editingHunk: null,
      usageEvents: [],
      usageSummary: null,
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
      validationRetry: null,
      planFiles: null,
      editingHunk: null,
      usageEvents: [],
      usageSummary: null,
    }),
  clearActivity: () => set({ activity: [] }),
  clearDiffs: () => set({ diffs: [], editingHunk: null }),
  setError: (msg) => set({ error: msg }),
  clearRateLimit: () => set({ rateLimit: null }),
  setModels: (models) => set({ models }),
  setSelectedModel: (m) => set({ selectedModel: m }),
  setAutoApproveFileScope: (b) => set({ autoApproveFileScope: b }),
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
  setEditingHunk: (target) => set({ editingHunk: target }),
  applyHunkEdit: (file, hunkIndex, newNew) =>
    set((s) => ({
      diffs: s.diffs.map((d) => {
        if (d.file !== file) return d;
        return {
          ...d,
          hunks: d.hunks.map((h, i) =>
            i === hunkIndex ? { ...h, new: newNew } : h,
          ),
        };
      }),
    })),
  addUsageEvent: (usage) =>
    set((s) => ({ usageEvents: [...s.usageEvents, usage] })),
  setUsageSummary: (summary) => set({ usageSummary: summary }),
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
              files: ev.files,
              reason: ev.reason,
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
          files: ev.files,
          reason: ev.reason,
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
          delayMs: number; reason: string; http_headers?: Record<string, string>;
        };
        get().addConversationTurn({
          kind: "model_retry",
          attempt: r.attempt,
          maxAttempts: r.maxAttempts,
          httpCode: r.httpCode,
          delayMs: r.delayMs,
          reason: r.reason,
          httpHeaders: r.http_headers,
          timestamp: now,
        });
        return;
      }
      case "validation_retry": {
        const vr = ev as unknown as {
          status: "ask" | "retry" | "abort";
          attempt: number;
          maxAttempts: number;
          message?: string;
          file?: string;
          line?: number | null;
          details?: { line: number; message: string }[];
        };
        if (vr.status === "ask") {
          set({
            validationRetry: {
              message: vr.message ?? "XML validation failed",
              file: vr.file,
              line: vr.line,
              details: vr.details,
              attempt: vr.attempt,
              maxAttempts: vr.maxAttempts,
            },
          });
          get().addConversationTurn({
            kind: "model_validation_error",
            message: vr.message ?? "XML validation failed",
            file: vr.file,
            line: vr.line,
            details: vr.details,
            attempt: vr.attempt,
            maxAttempts: vr.maxAttempts,
            timestamp: now,
          });
        } else if (vr.status === "retry") {
          set({ validationRetry: null });
          get().addConversationTurn({
            kind: "model_validation_retry",
            attempt: vr.attempt,
            maxAttempts: vr.maxAttempts,
            timestamp: now,
          });
        } else {
          // abort — clear the banner. The final error event will follow.
          set({ validationRetry: null });
        }
        return;
      }
      case "plan_files": {
        const pf = ev as unknown as {
          status: "ask" | "yes" | "no";
          files?: string[];
          reason?: string;
        };
        if (pf.status === "ask") {
          const files = pf.files ?? [];
          const reason = pf.reason ?? "";
          set({ planFiles: { files, reason } });
          get().addConversationTurn({
            kind: "model_plan_files_ask",
            files,
            reason,
            timestamp: now,
          });
        } else {
          // yes or no — clear the banner either way. The follow-up tool event
          // (name: plan_files) records the call itself in the activity log.
          set({ planFiles: null });
          get().addConversationTurn({
            kind: "model_plan_files_result",
            approved: pf.status === "yes",
            timestamp: now,
          });
        }
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
          editingHunk: null,
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
          validationRetry: null,
          planFiles: null,
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
        set({ error: evTyped.message, rateLimit: rl, failedEdit, validationRetry: null, planFiles: null });
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
          httpHeaders: evTyped.http_headers,
          timestamp: now,
        });
        return;
      }
      case "usage": {
        const u = ev as unknown as UsageEvent;
        set((s) => ({ usageEvents: [...s.usageEvents, u] }));
        get().addConversationTurn({
          kind: "model_usage",
          phase: u.phase,
          prompt_tokens: u.prompt_tokens,
          completion_tokens: u.completion_tokens,
          total_tokens: u.total_tokens,
          model: u.model,
          timestamp: now,
        });
        return;
      }
      case "usage_summary": {
        const us = ev as unknown as UsageSummaryEvent;
        set({ usageSummary: us });
        get().addConversationTurn({
          kind: "model_usage_summary",
          clarify: us.clarify,
          edit: us.edit,
          retries: us.retries,
          grand_total: us.grand_total,
          model: us.model,
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
            validationRetry: null,
            planFiles: null,
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
