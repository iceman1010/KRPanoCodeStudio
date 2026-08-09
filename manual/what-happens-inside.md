# What happens inside

KRpanoCode Studio looks like one app, but it's two programs working together:

1. **The desktop app** — the window you're using right now. It draws the
   preview, the buttons, the right panel.
2. **The CLI ("the PHAR")** — a headless program called `krpanocode.phar`
   bundled with the app. It does the actual work: reading your tour files,
   talking to the AI model, and writing the edited XML back.

This page explains how the two halves talk to each other and what happens
when you click **Send**. It's kept light — no source code, just the
choreography.

---

## The big picture

```
   ┌─────────────────┐    spawn + monitor     ┌──────────────────┐
   │  Desktop app    │ ─────────────────────► │ krpanocode.phar  │
   │  (this window)  │                        │  (the engine)    │
   │                 │ ◄─── stream of events ─ │                  │
   │                 │   (one JSON object     │                  │
   │                 │    per line)           │                  │
   └─────────────────┘                        └──────────────────┘
           │                                          │
           │ user prompt                              │ tool calls
           ▼                                          ▼
        [ You ]                                  [ AI model via proxy ]
```

The app is a **front-end**. Everything that actually touches your tour files
is done by the PHAR.

---

## The event stream (NDJSON)

When the app starts the PHAR on your prompt, the PHAR begins emitting a
**stream of events** on its output — one JSON object per line, flushed as they
happen. (The format is called **NDJSON**, for "newline-delimited JSON".)

The app parses each line and turns it into something you can see. Here's the
event list:

| Event | What it means | What the UI does |
|-------|---------------|------------------|
| `start` | The PHAR has read your tour and made a backup. Sends the tour name, the backup path, and the editable/locked file lists. | Stores the backup path, populates the **Files summary**, shows `working`. |
| `reasoning` | A short note from the model between tool calls (e.g. *"I'll look at tour.xml first"*). | If "Show AI reasoning" is on in Settings, appends to the Activity log. |
| `tool` | The model made a tool call — `plan_files`, `read_file`, `docsearch`, or `write_file`. Includes the file, the query (for docsearch), bytes written, and wall-clock ms. | Appends a row to the **Activity log**. |
| `plan_files` | The AI wants to pre-read a set of files before editing and is asking you to confirm. Carries the file list + a short reason. | **Plan files panel** appears with the proposed files and reason; you Approve or Decline. Status turns amber while waiting. |
| `clarify` | The AI has a question for you before going further. Carries `status: clear` (intent confirmed) or `status: clarify` (asks a question). | **Clarify panel** appears with the question; status turns violet. |
| `validation_retry` | The AI produced XML that failed validation. Carries the error, the failing file/line, and an ask/retry/abort status. | **Validation retry banner** appears with the error details and Retry / Abort buttons. |
| `retry` | The CLI's auto-retry loop is retrying an HTTP call that failed (gateway 524 etc.). Carries attempt N/M, the HTTP code, the delay before retry, a reason slug, and — when the upstream sent them — the response headers (`cf-ray`, `retry-after`, `server`, `cf-cache-status`). | Shows a "Retrying 1/2…" row in the Activity log and Conversation log. |
| `diff` | The PHAR finished writing a file. Carries the file name and a list of hunks (line, context, old, new). | Renders a **diff card** in the bottom of the right panel, one per file. |
| `done` | The edit finished. Optionally the total wall-clock duration in ms. | Status turns blue (`review`) if diffs exist; otherwise back to `idle`. |
| `restored` | An undo restored the files. Lists the restored file paths and the backup they came from. | Clears diffs, status returns to `idle`. |
| `error` | Something failed (rate limit, network, bad prompt). Carries a message; for rate limits also `kind`, `model`, `reset_at`, `retry_after_seconds`; for any HTTP failure also `http_code`, `retry_attempts`, and `http_headers` (redacted — no `authorization`/`set-cookie`). | Shows the error banner; for 429 a **Rate-limit banner** with countdown and Retry; for 5xx a **blue Resume banner** (see Troubleshooting). |

You can watch this stream any time by opening the **Conversation log** modal
(the MessageSquare icon in the top bar) — it shows the full timeline of the
current run, timestamped.

---

## Backups

Before the PHAR writes anything, it copies the **current state of your
editable files** into a per-tour backup folder:

```
your-tour-folder/
  .krpanocode-backup/
    2026-08-06-1/              ← the most recent edit's backup
      tour.xml
      skin/skin.xml
      panel.xml
      ...
```

- Backups are created **automatically** before every edit — you don't opt in.
- Only the **N most recent** are kept per tour (default 10). Older ones are
  pruned by the PHAR automatically. Change `N` in
  **Settings → Backup retention**.
- **Undo** (the Action bar button in `review` state) restores from the most
  recent backup. There's no multi-undo — each new edit replaces the previous
  backup, so Undo always reverts the *latest* edit only.

---

## The Clarify round-trip (a bit more detail)

When you send with **Clarify**, the PHAR doesn't ask the AI to edit yet — it
first asks the AI whether your instruction is clear. Then:

- If the AI says **clear**, the PHAR proceeds to the editing phase and you
  see the normal tool/diff flow.
- If the AI says **clarify** and asks a question, the PHAR emits a `clarify`
  event and **blocks**, waiting for one line of text on its standard input —
  that's the violet panel you see.

When you click **Send answer**, the app writes your text to the PHAR's
input, the PHAR adds your answer as extra context for the editing call, and
the edit continues. If you click **Skip & cancel**, the app writes `"skip"`
and the PHAR aborts cleanly. Nothing is written to your files.

---

## The Plan-files round-trip (a bit more detail)

For non-trivial multi-file edits, the AI may emit a `plan_files` event **after**
the start event (and after clarify, if used) and **before** any `read_file`/
`write_file`. It's the AI saying: *"Here are the files I think I need to read
to do this edit — OK?"* You see an amber **Plan files** panel listing the
proposed files and the AI's one-sentence reason.

- Click **Approve** and the app writes `"yes"` to the PHAR's stdin. The PHAR
  returns the **full content of every approved file** to the AI as one block,
  so it doesn't need separate `read_file` calls for those files. The edit
  continues.
- Click **Decline** and the app writes `"no"`. The AI receives a "User
  declined" message and falls back to individual `read_file` calls for just
  the files it most needs. The edit still continues — you're declining the
  bulk pre-read, not the edit itself.

The AI is told to call `plan_files` only when the edit genuinely benefits from
confirmation (multi-file edits, ambiguous targets) and to skip it for trivial
single-file edits where the target is obvious. So you won't see this panel on
every run — only when the AI thinks it's worth checking with you first.

**Why this exists:** when the AI only sees a list of file paths (no contents),
it sometimes picks the wrong file to edit — e.g. it once changed a title colour
in `skin/vtourskin.xml` when the actual target was the `textnames` style in
`panel.xml`. The plan-files step shows you what the AI is about to anchor on,
and the rich manifest hints (see below) help the AI pick correctly in the
first place.

---

## Auto-retry on transient errors

The PHAR talks to the AI through an LLM proxy. Network hiccups happen, so
the PHAR retries failed requests **automatically** before giving up:

| Error | Strategy |
|-------|----------|
| **429 rate limit**   | Retry up to 3 times with exponential backoff. Honours the proxy's `Retry-After` hint when provided. |
| **502 / 503 / 504 / 520–524** (gateway family) | Retry up to 2 times with linear backoff. |
| Other **5xx** server error | No retry — fail fast and surface the error. |
| 4xx client errors (auth, bad request)         | Never retried. |

While it's retrying you'll see a small **"retry"** event in the stream and
the Activity log — it's harmless, just keep waiting. If the retries are
exhausted, you get a clear error event with the original message.

Each retry event (and the final error event for HTTP failures) carries the
**response headers** the upstream sent back — things like `cf-ray`,
`retry-after`, `server`, `cf-cache-status`. The `authorization` header is
stripped before the event leaves the PHAR, so no API key ever leaks. These
headers also land in the app log file (`~/.config/krpanocode-studio/studio.log`
on Linux) — useful when reporting a recurring proxy issue to your provider.

This means most transient blips are invisible to you — you just see a run
that took a bit longer than usual. Only real failures reach the error banner.
For 5xx gateway failures specifically, the UI also shows a **blue Resume
banner** that re-runs the same prompt from the clean backup; see
**Troubleshooting → "Network hiccup" blue banner**.

---

## Idle timeout: when the stream goes silent

Some CLI calls (especially long edits, or the moment a Clarify question is
awaiting your answer) can stay quiet for a long time. If the connection to
the proxy dies in that silence — because you suspended your laptop, dropped
the wifi, or the proxy crashed — the PHAR has no way to know and would
otherwise wait forever.

To keep from getting stuck, the app watches for silence:

- If the PHAR produces **no output for longer than your configured idle
  timeout** (default 5 minutes, adjustable in
  **Settings → CLI idle timeout**), the app shows an **Idle timeout** dialog:
  - **Abort** — kill the running process and return to `idle`.
  - **Extend** — wait another timeout period before asking again.
- The timer is **paused while you're answering a Clarify question** (since
  you wouldn't want the timer to fire while you're thinking). It re-arms once
  you send your answer.

So a frozen-looking app gives you a clear choice instead of hanging silently.

---

## Model selection

The model dropdown in the top bar lists every model your LiteLLM proxy
exposes. When you pick one:

- The choice is saved to your **preferences** (`~/.config/krpanocode-studio/`
  on Linux; equivalent platform path on macOS/Windows) and remembered next
  time you open the app.
- Every new prompt goes to that model until you change it.

The model used for a given edit appears in the Conversation log timeline
(though it's not shown in the activity log by default).

---

## Where things live on disk

| What | Where |
|------|-------|
| API key + default model   | `~/.krpanocode/.env` (written by the PHAR during Setup; readable by you only) |
| Tour backups              | `<tour-folder>/.krpanocode-backup/` |
| App preferences + log     | `~/.config/krpanocode-studio/` (Linux); `~/Library/Application Support/krpanocode-studio/` (macOS); `%APPDATA%\krpanocode-studio\` (Windows) |
| Debug log file            | `<app-data>/studio.log` — see [Troubleshooting](troubleshooting.md) |

The app itself lives in your Applications / Program Files / wherever you
installed it; the PHAR is bundled inside the app's resources.

---

## What the AI does (and doesn't)

You might wonder what the model "sees" when you send a prompt:

- It sees your **prompt**.
- It sees a **structural manifest** of your editable files — not just paths
  and sizes, but also bracketed hints per file like
  `[defines-styles:textnames]` (this file defines the `textnames` style),
  `[uses-styles:textnames]` (this file references it), and `[align:bottomleft]`
  (positional cues). This helps the AI target the right file without reading
  every candidate.
- It sees the **contents of your editable files** — either by asking the PHAR
  to read them via `read_file` tool calls (that's the `read_file` rows in the
  Activity log), or in bulk via the `plan_files` round-trip above.
- It sees **relevant KRPano documentation** that the PHAR pulls in via
  `docsearch` from the 27 curated 1.23.3 docs bundled with the CLI. This
  makes the AI smarter about krpano-specific element names and attributes.
- It sees any **Clarify answer** you gave, plus — when Clarify was used —
  the **target identification** the AI itself produced at clarify time
  (e.g. *"I will change the `textnames` style in `panel.xml`"*). This is
  carried forward as an explicit anchor so the edit phase doesn't second-
  guess the target the clarify phase already nailed down.

It **doesn't** see:

- Your locked / binary files (the PHAR won't send them).
- Files outside the tour folder.
- Other tours you've worked on.
- Your API key (the key is used by the proxy for auth; it's not part of the
  prompt).

All edits happen via the tool protocol — the model requests a `write_file`
on a specific path and the PHAR executes it. The model can't write to files
elsewhere on your machine, only inside the tour folder you opened.
