# Editing a tour

This page covers the core loop — writing a prompt, reviewing the diff, and
deciding whether to keep or undo. Once you're comfortable with this, you've
mastered most of the app.

---

## The basic loop

1. **Write a prompt** in the Ask box (plain English, specific beats vague).
2. **Send** (or `⌘↵` / `Ctrl+Enter`). The status dot turns amber.
3. **Watch the Activity log** fill with tool calls as the AI reads your
   files and writes back changes.
4. **Review the Diff** that appears at the bottom when the AI is done. The
   status dot turns blue (**review**).
5. **Keep** or **Undo**.

That's it. Every prompt starts a fresh run with a fresh backup.

---

## Writing a good prompt

The AI is good, but it isn't psychic. Specific prompts get specific edits;
vague prompts get best-guess edits — or a Clarify question back.

### Good

> Rename the scene `"scene_poolsideday"` to `"Swimming Pool"` in `tour.xml`.

> Add a hotspot from `scene_lobby` to `scene_pool` at coordinates `x="50%" y="40%"`.

> Change the autorotation speed to 3 and the delay before it starts to 4 seconds.

> Update the `title` attribute of all `<scene>` tags in `tour.xml` to use the
> scene name with underscores replaced by spaces and Title Case.

### Too vague

> Change the colours. *(Which colours? Which file? Which elements?)*

> Improve the thumbnails. *(Improve how? Which ones?)*

> Make it nicer. *(No.)*

For the vague ones, send with **Clarify** instead and the AI will ask you a
question before editing — see [Clarify](clarify.md).

### Prompt tips

- **Name files when you can** — `tour.xml`, `skin/skin.xml`, `panel.xml`. The
  AI will look at every editable file by default; pointing it at the right
  one is faster and more accurate.
- **Use scene names verbatim** — `"scene_poolsideday"`, not "the pool scene".
  Copy the scene name from the `<scene name="...">` attribute in your XML.
- **Quote attribute values** you want to set — `title="Swimming Pool"`, not
  "Swimming Pool" (the AI might second-guess the capitalisation otherwise).
- **One concern per prompt** — if you want to change autorotation *and* add a
  hotspot, send two prompts. The diff review is clearer and the Undo is
  per-concern.

---

## Watching the Activity log

While the AI works, the **Activity** panel beneath your prompt fills up:

```
read_file   tour.xml                         0.4s
docsearch   "scene title attribute"          2.1s
write_file  tour.xml         8,494 B          0.0s
```

- **`read_file`** — the AI opened a file from your tour. Usually all the
  editable files before it decides what to change.
- **`docsearch`** — the AI searched the bundled KRPano 1.23.3 documentation
  for a relevant term and fed that context to the model. Skipped when an
  exact syntax match isn't needed.
- **`write_file`** — the AI wrote the new content for a file. Bytes show how
  big the new version is.
- **Reasoning lines** (italic, grey) — short notes the model emitted between
  tool calls. Off by default; enable in Settings if you want to see the
  model's thinking.

The log auto-scrolls while running and auto-collapses once the review state
starts. Click the header to expand it again.

---

## Reading the diff

After the AI is done, a diff card appears for every file that changed:

```
tour.xml (1 change)
  L123  <scene name="scene_poolsideday" ...>
  −       title="Main Pool"
  +       title="Swimming Pool"
```

- The **file name** is the card header; click to collapse.
- `L123` is the line number in the **new** file (after the edit).
- Grey lines are **context** — unchanged surrounding code, so you can see
  where the change is.
- Red `−` lines are what was removed; green `+` lines are what was added.
  Multi-line changes show each affected line.

Each file has its own card — a multi-file edit appears as a stack of cards.

---

## Keep or Undo

At the bottom of the right panel, in the `review` state, you get two buttons:

### Keep
- **Dismisses** the diff from view.
- The files on disk **already contain the changes** — the AI wrote them
  during the run. Keep is just a visual acknowledgement.
- The status dot returns to green (`idle`), ready for the next prompt.

### Undo
- Rolls the tour files **back to the backup** that was made before this edit
  started. The AI's edits are undone on disk.
- The status dot returns to green (`idle`).
- An "Undo" toast appears; the diff card closes.

There's no multi-undo history in the UI — each edit makes a fresh backup, so
Undo always reverts **the latest edit only**. If you want to undo an older
edit, you'd need to restore from an earlier backup manually (the backups live
in `.krpanocode-backup/` inside your tour folder).

---

## Stop a running edit

While the AI is working, the **Stop** button appears in the prompt box
header. Click it to abort the current run. What happens:

- The running process is terminated.
- If the AI had already written any files, those changes stay on disk —
  Stop doesn't roll back. Use **Undo** afterwards to restore from the backup.
- The status dot returns to `idle` (or `review` if diffs are present).

Stop is useful when you realise the prompt was wrong and you don't want to
burn more API time waiting for a wrong edit to finish.

---

## Backups: every edit is safe

Before the AI writes anything, the CLI copies the **current state of your
editable files** into a backup folder inside your tour:

```
your-tour/
  .krpanocode-backup/
    2026-08-06-1/         ← most recent edit's backup
      tour.xml
      skin/skin.xml
      ...
```

- Backups are **per tour**, not global.
- The CLI keeps the **N most recent** backups per tour (default 10). Older
  ones are pruned automatically. You can change `N` in
  **Settings → Backup retention**.
- **Undo** always restores from the most recent backup.

!!! warning "Don't delete `.krpanocode-backup/`"
    If you manually delete the backup folder you lose the ability to Undo the
    last edit. Let the CLI's pruning handle cleanup.

---

## Next: Clarify mode

For ambiguous prompts, send with **Clarify** instead of **Send** — the AI
will ask you a question before it touches your files. See
[Clarify](clarify.md).
