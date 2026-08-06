# Getting started

This page takes you from a fresh install to your first edited tour in about
five minutes.

---

## What you need

1. **KRpanoCode Studio** installed on your computer. Download the latest
   release for your platform from the
   [releases page](https://github.com/iceman1010/KRpanoCodeStudio/releases).
2. **An API key** for a LiteLLM proxy (typically hosted by your organisation).
   The key looks like `sk-...`. You'll only need it once, to set up the app.
3. **A KRPano tour folder** on disk — any folder that contains an
   `index.html` plus the tour XML files (`tour.xml`, `skin/skin.xml`,
   `panel.xml`, etc.). The folder can be a published tour or just a working
   copy.

!!! tip "No tour folder handy?"
    Any unzipped KRPano tour will do — including the example tours bundled with
    krpano's tools. As long as there's an `index.html`, the app can open it.

---

## First run: set your API key

The first time you open the app you'll see the empty start screen. The
**Top bar** at the top of the window will show a small red **"No API key"**
badge in place of the model dropdown.

1. Click the **gear icon** (Settings) in the top-right corner.
2. In the **API key** field, paste your `sk-...` key.
3. Click **Verify**. The app calls the proxy to confirm the key works and
   fetches the list of available models.
4. If verification succeeds you'll see a toast: *"API key verified & saved"*.
   The model dropdown in the top bar now lists the models your proxy offers.
5. Pick a default model from the dropdown (you can change it any time).
6. Click **Done** to close Settings.

Your key is stored by the bundled CLI in a small file at:

| OS | Location |
|----|----------|
| Linux   | `~/.krpanocode/.env` |
| macOS   | `~/.krpanocode/.env` |
| Windows | `%USERPROFILE%\.krpanocode\.env` |

This file is readable by you only. Nothing is sent to the app authors.

!!! note "If verification fails"
    The most common cause is a typo in the key, or the proxy being unreachable
    from your network. The toast shows the exact message from the proxy
    (e.g. `API key rejected (401)`). Fix the key and try again.

---

## Open a tour

From the start screen you have two ways to open a tour:

- **Choose folder…** — opens your OS folder picker. Select the tour folder
  that contains `index.html`.
- **Drag-and-drop** the tour folder anywhere onto the window.
- **Recent tours** — if you've opened tours before, they're listed as quick
  links with a "opened 2h ago" timestamp.

Once opened, the window splits in two:

- On the **left**, a live preview of your tour renders inside an embedded
  browser. You can interact with the tour (pan, click hotspots) just like in
  a real browser.
- On the **right**, the editing panel is ready for your first prompt.

The status dot next to the app name in the top bar turns from grey to green —
meaning **idle** and ready.

!!! tip "Reopening a tour"
    Recently opened tours are remembered. You can open them again from the
    start screen in one click, or use the **Open…** button in the top bar
    when a tour is already loaded.

---

## Make your first edit

1. In the **Ask** box on the right panel, type a specific instruction, e.g.:

   > Rename the scene "scene_poolsideday" to "Swimming Pool"

2. Click **Send** (or press `⌘↵` / `Ctrl+Enter`). The status dot turns amber
   and the **Activity** log beneath the prompt fills with tool calls the AI
   is making:
   ```
   read_file  tour.xml
   write_file tour.xml  (8,494 B)
   ```
3. When the AI is done, the status dot turns blue (**review**) and a **diff**
   appears showing exactly what changed:
   ```
   L123  <scene name="scene_poolsideday" ...>
   -       title="Main Pool"
   +       title="Swimming Pool"
   ```
4. Click **Keep** to accept, or **Undo** to roll back from the backup that was
   made before the edit.

That's the whole loop — prompt, watch, review, keep or undo. For more on
writing good prompts and reading diffs, see
[Editing tours](editing-tours.md).

---

## If something looks wrong

- **"Models unavailable"** in the top bar: the model list couldn't be loaded.
  Open Settings and verify your API key, or check your network connection to
  the proxy.
- **No tour preview**: make sure the folder has an `index.html`. Reload the
  preview with the circular arrow button in the top-right of the preview.
- **The app feels frozen**: if a CLI call goes silent for longer than your
  configured idle timeout (default 5 minutes), an **Idle timeout** dialog
  appears offering **Abort** or **Extend**. Choose one.

More in [Troubleshooting](troubleshooting.md).
