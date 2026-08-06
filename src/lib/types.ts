// TypeScript types for the krpanocode --json NDJSON contract.
// Source of truth: PLAN-UI-APP.md "The `--json` contract".

export type PharEvent =
  | StartEvent
  | ReasoningEvent
  | ToolEvent
  | DiffEvent
  | ClarifyEvent
  | DoneEvent
  | RestoredEvent
  | ErrorEvent
  | RetryEvent
  | StreamEndEvent
  | VersionEvent
  | ModelsEvent
  | SetupEvent
  | StderrEvent;

export interface StartEvent {
  type: "start";
  tour: string;
  backup: string;
  editable: string[];
  locked: string[];
}

export interface ReasoningEvent {
  type: "reasoning";
  text: string;
}

export interface ToolEvent {
  type: "tool";
  name: string; // "read_file" | "write_file" | "docsearch" | ...
  file?: string;
  query?: string;
  bytes?: number;
  ms?: number;
}

export interface DiffHunk {
  line: number;
  context?: string;
  old?: string;
  new?: string;
}

export interface DiffEntry {
  file: string;
  hunks: DiffHunk[];
}

export interface DiffEvent {
  type: "diff";
  file: string;
  hunks: DiffHunk[];
}

export interface ClarifyEvent {
  type: "clarify";
  status: "clear" | "clarify";
  reason?: string;
  question?: string;
}

export interface DoneEvent {
  type: "done";
  ms?: number;
}

export interface RestoredEvent {
  type: "restored";
  files: string[];
  backup: string;
}

export interface ErrorEvent {
  type: "error";
  message: string;
  // Rate-limit (429) additive fields — present only when kind === "rate_limit".
  kind?: "rate_limit";
  model?: string;
  reset_at?: string; // ISO-8601 UTC, e.g. "2026-07-25T10:44:41Z"
  retry_after_seconds?: number;
  // Transient-failure additive fields (Part 1 — Resume after gateway timeout).
  // Present on 5xx/gateway errors so the UI can offer a Resume button.
  resumable?: boolean;
  http_code?: number;
  retry_attempts?: number;
  // Part 2 — diagnostic HTTP headers from the failing response (redacted:
  // `authorization` is stripped on the CLI side before emission).
  http_headers?: Record<string, string>;
}

/**
 * Emitted by the PHAR between failed HTTP attempts (PLAN-JSON-MODE.md).
 * Surfaced in the activity log as "Retrying (2/3) in 4s…".
 * Part 2 also adds `http_headers` so each attempt's response headers can be
 * inspected for cf-ray / retry-after / server hints.
 */
export interface RetryEvent {
  type: "retry";
  attempt: number;
  maxAttempts: number;
  httpCode: number;
  delayMs: number;
  reason: string;
  http_headers?: Record<string, string>;
}

// Synthetic event emitted by the Rust streamer when stdout closes (process exited).
export interface StreamEndEvent {
  type: "__stream_end__";
}

export interface VersionEvent {
  type: "version";
  version: string;
}

export interface ModelsEvent {
  type: "models";
  models: string[];
}

export interface SetupEvent {
  type: "setup";
  ok: boolean;
  model?: string;
  error?: string;
}

// Synthetic event for non-JSON lines on stdout (surface stderr noise).
export interface StderrEvent {
  type: "stderr";
  text: string;
}

// ----- UI phases (matches LAYOUT.md state machine) -----

export type Phase = "empty" | "idle" | "working" | "review" | "clarify";

// ----- Activity log entries -----

export interface ActivityEntry {
  id: string;
  kind: "tool" | "reasoning" | "info";
  // For tool entries:
  toolName?: string;
  file?: string;
  query?: string;
  bytes?: number;
  ms?: number;
  // For reasoning entries:
  text?: string;
  // Common:
  timestamp: number;
}

// ----- Conversation log entries -----

export type ConversationTurn =
  | { kind: "user_prompt"; text: string; clarify: boolean; timestamp: number }
  | { kind: "user_clarify_answer"; text: string; timestamp: number }
  | { kind: "user_skip"; timestamp: number }
  | { kind: "model_clarify_question"; text: string; timestamp: number }
  | { kind: "model_clarify_clear"; reason: string; timestamp: number }
  | { kind: "model_reasoning"; text: string; timestamp: number }
  | { kind: "model_tool"; toolName: string; file?: string; query?: string; bytes?: number; ms?: number; timestamp: number }
  | { kind: "model_retry"; attempt: number; maxAttempts: number; httpCode: number; delayMs: number; reason: string; timestamp: number }
  | { kind: "model_diff"; file: string; hunks: DiffHunk[]; timestamp: number }
  | { kind: "model_done"; ms?: number; timestamp: number }
  | { kind: "model_error"; message: string; resumable?: boolean; httpCode?: number; retryAttempts?: number; timestamp: number }
  | { kind: "model_restored"; files: string[]; timestamp: number };

/**
 * Snapshot kept in-memory (Zustand) while a prompt is running, so that on a
 * transient failure (gateway 524 / 5xx) the UI can offer a Resume button that
 * re-issues the same intent without forcing the user to retype the prompt +
 * clarify answer. Cleared on a clean `done` or when a new prompt starts.
 */
export interface LastEdit {
  prompt: string;            // original user prompt (-p)
  clarifyAnswer: string | null; // final clarify answer, if clarified (merged into the resume instruction)
  clarify: boolean;          // was --clarify used?
  model: string | null;      // -m, may be null for default
  startedAt: number;         // Date.now() at beginRun
  tourFolder: string;        // tour folder the edit targeted (must match on resume)
}
