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
  | { kind: "model_reasoning"; text: string; timestamp: number }
  | { kind: "model_tool"; toolName: string; file?: string; query?: string; bytes?: number; ms?: number; timestamp: number }
  | { kind: "model_diff"; file: string; hunks: DiffHunk[]; timestamp: number }
  | { kind: "model_done"; ms?: number; timestamp: number }
  | { kind: "model_error"; message: string; timestamp: number }
  | { kind: "model_restored"; files: string[]; timestamp: number };
