# Clarify mode

**Clarify** is an optional mode for the prompt box. When you send with the
**Clarify** button instead of **Send**, the AI checks it understood your
instruction *before* it touches your files. If your instruction is clear, it
proceeds normally. If it's ambiguous, it asks you a question first.

---

## When to use Clarify

### Use Clarify when
- Your instruction could be interpreted multiple ways ("change the colours",
  "improve the thumbnails", "update the menu").
- You're editing across multiple files and want to be precise about what
  changes where.
- You want a sanity check before the AI spends time and tokens on a guess.

### Skip Clarify when
- The instruction is specific and unambiguous ("rename scene_lobby to
  scene_entry", "add a hotspot from A to B").
- You already know exactly what you want, and you're fine reviewing the diff
  afterwards.

Clarify costs an extra round-trip to the model (a few seconds), so it's
slightly slower for the obvious cases. The trade-off is fewer wrong guesses
for the vague ones.

---

## The Clarify round-trip

Here's the flow, step by step:

1. **You write a prompt and click Clarify.** The status dot turns amber
   (`working`). The AI reads your instruction and the tour files.
2. **The AI responds with one of two outcomes:**

   ### Outcome A — "clear"
   The AI emits a `clarify` event with `status: clear` and a short reason:
   > *Status: clear — I will change the `title` of scene "scene_poolsideday"
   > in `tour.xml` from "Main Pool" to "Swimming Pool".*

   The edit continues immediately — you see tool calls and a diff as usual,
   and the status moves to `review` when done. You did nothing extra; Clarify
   just confirmed intent on the way through.

   ### Outcome B — "clarify"
   The AI emits a `clarify` event with `status: clarify` and a question.
   The status dot turns violet, and a violet **Clarify** panel appears
   between the prompt box and the Activity log:

   ```
   ┌─────────────────────────────────────────────────┐
   │ 🤖 Clarify                                       │
   │                                                  │
   │ Which colors would you like to change — the      │
   │ overall skin background, the button colors, or   │
   │ the hotspot tooltip background?                   │
   │                                                  │
   │ [ Your answer…                ]                 │
   │ [ Send answer ]   [ Skip & cancel ]              │
   └─────────────────────────────────────────────────┘
   ```

3. **You answer the question** in the text area. Be specific — your answer
   becomes part of the editing instruction the AI now follows.
4. **Click Send answer** (or `⌘↵` / `Ctrl+Enter`). The status dot returns to
   amber, the AI proceeds with the edit using your answer as additional
   context, and you eventually reach the diff review as usual.

---

## Skip & cancel

If the question makes no sense, or you've changed your mind, click
**Skip & cancel**:

- The app writes `"skip"` to the running CLI.
- The CLI aborts the edit and rolls back any partial work.
- The status dot returns to green (`idle`).
- No files are changed.

This is the explicit abort for a Clarify round. It's safe to use at any
point while the violet panel is showing.

---

## Tips for Clarify answers

- **Answer the question directly.** If the AI asks "which colors?", answer
  with the specific elements — "the button background and the tooltip
  border" beats "the blue ones".
- **You can give more than asked.** If the question is "which scenes?", you
  can answer "scene_lobby and scene_pool — and also change the title of
  scene_entry to 'Welcome'".
- **Don't repeat the whole prompt.** The AI already has it; just give the
  missing piece.

---

## What happened? (look back in the Conversation log)

Clarify questions and your answers are recorded in the **Conversation log**
modal (the MessageSquare icon in the top bar). Open it after a run to see the
full timeline — your prompt, the Clarify question, your answer, the tools,
the diff, and the outcome — each timestamped.

---

## A Clarify example, end to end

**Prompt (Sent with Clarify):**
> Update the skin colors for this tour.

**AI Clarify question:**
> Which colors would you like to change — the overall skin background, the
> button colors, or the hotspot tooltip background?

**Your answer:**
> The button colors — make them a darker shade of blue, and the tooltip
> border too. Leave the background.

**Resulting Activity log:**
```
read_file  skin/skin.xml                        0.3s
read_file  skin/loadingbar.xml                  0.1s
docsearch  "style background color"             1.8s
write_file skin/skin.xml      4,210 B            0.0s
```

**Diff:** two files changed — blue values replaced with darker hex codes, the
tooltip border updated, the background left untouched (as you asked).

Keep or Undo as usual.
