# The interface

The window is split into three regions: the **Top bar**, the **Preview** on
the left, and the **Right panel** (where you do the editing). Below is a
quick tour of each.

```
┌────────────────────────────────────────────────────────────────┐
│  Top bar: app name · status dot · tour · model · settings · help│
├────────────────────────────────────────┬───────────────────────┤
│                                        │  Right panel          │
│                                        │  ┌───────────────────┐│
│                                        │  │ Ask (prompt box)  ││
│  Preview (live tour)                   │  ├───────────────────┤│
│                                        │  │ Files summary    ││
│                                        │  ├───────────────────┤│
│                                        │  │ Activity log     ││
│                                        │  ├───────────────────┤│
│                                        │  │ Diff viewer      ││
│                                        │  ├───────────────────┤│
│                                        │  │ Keep / Undo      ││
│                                        │  └───────────────────┘│
└────────────────────────────────────────┴───────────────────────┘
```

---

## Top bar

| Element | Meaning |
|---------|---------|
| **App name** | "KRpanoCode Studio" — click does nothing, it's a label. |
| **Status dot** | Coloured circle showing the current state (see below). |
| **Tour name badge** | The folder name of the currently open tour. |
| **Open… / Close** | Switch to another tour, or go back to the start screen. |
| **Model dropdown** | Pick the AI model for new prompts. Persisted between runs. |
| **Settings (gear)** | Open the Settings modal (API key, theme, updates, etc.). |
| **Conversation log** | Open a full-screen timeline of the current edit run. |

### Status dot colours

| Colour | State | Meaning |
|-------|-------|---------|
| Grey    | `empty`   | No tour loaded. |
| Green   | `idle`    | A tour is open and the app is ready for a prompt. |
| Amber (pulsing) | `working` | An edit is in progress — the AI is reading/writing files. |
| Violet (pulsing) | `clarify` | The AI has a question for you; answer it in the violet panel. |
| Blue    | `review`  | An edit finished; review the diff and choose Keep or Undo. |

### Top-bar state hints

If the model dropdown is replaced by:

- **"Loading models…"** — the app is fetching the model list from your proxy.
- **"Models unavailable"** (red) — the list couldn't be loaded. Open Settings
  and verify your API key, or check your network.
- **"No API key"** badge — no key configured yet. Open Settings → enter key →
  Verify.

---

## Preview (left panel)

A live render of your tour in an embedded browser — the same engine your OS
uses for Chrome/Edge/Safari, depending on your platform. You can:

- **Pan, zoom, click hotspots** exactly like in a real browser.
- **Reload** (circular arrow, top-right of the preview) — refreshes the
  embedded view. The preview also reloads automatically after a successful
  edit.
- **Open in browser** (external-link icon) — opens the tour in your system
  browser at the same URL.

The preview is served from a tiny local web server embedded in the app, so the
URL is `http://localhost:<port>/...` and is only reachable from your machine.

---

## Right panel — the editing panel

This is where you spend most of your time. From top to bottom:

### Ask (prompt box)
- A text area for your edit instruction, in plain English.
- **Send** — submit the prompt and start an edit.
- **Clarify** — same as Send, but asks the AI to confirm it understood first
  (see [Clarify](clarify.md)).
- **Stop** — appears during a working state and aborts the current edit. The
  backup is preserved.
- `⌘↵` / `Ctrl+Enter` — keyboard shortcut for Send.
- An elapsed timer shows how long the current run has been going.

### Clarify chat (violet panel, only when clarifying)
When the AI has a follow-up question, this panel appears between the prompt
box and the Files summary. Answer in the text area and click **Send answer**
(or Skip & cancel to abort). See [Clarify](clarify.md) for the full flow.

### Files summary
A collapsible list of every file the CLI inspected for this tour, split into:

- **Editable** (blue icon) — XML files the AI is allowed to change.
- **Locked** (grey lock icon) — files that are encrypted or binary (e.g.
  `blend.xml`); shown for completeness, the AI won't touch them.

Click the row to expand/collapse.

### Activity log
A live view of what the AI is doing, as it happens:

- **Tool calls** — `read_file tour.xml`, `docsearch "scene title"`,
  `write_file tour.xml (8,494 B)`. Each shows the wall-clock time it took.
- **Reasoning** lines — short italic notes the model emitted between tool
  calls. These are off by default; turn them on in
  **Settings → Show AI reasoning in activity log**.

The log auto-scrolls while the edit is running and auto-collapses once the
review state is reached. Click the header to expand it again.

### Diff viewer
After the AI finishes, a line-by-line diff of each changed file:

- A grey context line shows where in the file the change happened, with the
  line number (`L123`).
- Red lines (`−`) show what was removed; green lines (`+`) show what was
  added.
- Each file gets its own collapsible card showing the number of changes.

The diff appears only after the edit is written. The files on disk are
already changed at this point — **Keep** just dismisses the diff from view;
**Undo** rolls them back from the backup.

### Action bar (Keep / Undo)
Appears only in the `review` state. See [Editing tours](editing-tours.md)
for what each does.

---

## Conversation log modal

The **MessageSquare icon** in the top bar opens a full-screen modal showing
the entire timeline of the current edit run — your prompt, the AI's
reasoning, every tool call, every diff, and the final outcome. It's per-run:
starting a new prompt clears it. Use it to look back at what happened when
the activity log has already auto-collapsed.

There's a **Copy transcript** button in the modal header if you want to paste
the whole run into a support ticket or a note.

---

## Settings modal

Covered in detail on the [Settings](settings.md) page. Briefly: API key, default
model, backup retention, CLI idle timeout, theme, show-reasoning toggle, app
update, CLI (PHAR) update, and the **View log** button.
