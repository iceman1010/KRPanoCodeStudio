# Settings

Open the Settings modal with the **gear icon** in the top-right corner. The
modal scrolls; everything you change here is saved immediately unless it
says otherwise.

---

## API key

Your LiteLLM proxy API key (`sk-...`). Paste it in and click **Verify** —
the app pings the proxy, and if it accepts the key, the list of available
models loads into the model dropdown in the top bar.

Where it's stored: `~/.krpanocode/.env` (Linux/macOS) or
`%USERPROFILE%\.krpanocode\.env` (Windows). This file is written by the CLI
during verification and is readable by you only.

---

## Default model

Which model new prompts are sent to. The dropdown lists every model your
proxy offers. Your choice is saved to app **preferences** (separately from
the `.env` default set by the CLI), so the dropdown persists between
restarts.

You can also change the model on the fly from the top bar — Settings and the
top bar dropdown stay in sync.

---

## Backup retention

How many backups to keep **per tour**. Default 10. The CLI manages pruning:
when you start a new edit, if there are already N backups for that tour, the
oldest is deleted. Increase the number if you want a longer history;
decrease if disk space is tight.

This value is written to `~/.krpanocode/.env` as `KRpanocode_BACKUP_KEEP`.

---

## CLI idle timeout

How long the app waits with no output from the CLI before showing the
**Idle timeout** dialog (see [What happens inside](what-happens-inside.md)
for the rationale). Default 5 minutes. Range 1–60.

Increase if you routinely run very long edits that legitimately produce no
output for a while; decrease if you want a faster abort on stalled
connections. Applies on the next run — current runs keep their current timer.

---

## Theme

`Light`, `Dark`, or `System` (follows your OS). Saved to preferences and
applied immediately.

---

## Show AI reasoning in activity log

Tick to display the model's reasoning notes between tool calls in the
Activity log. Reasoning lines appear grey-italic. Off by default; turn it
on if you want to see how the model is thinking through a prompt.

(The reasoning is **always** recorded in the Conversation log modal's
timeline regardless of this setting — this toggle only controls whether it
appears in the inline Activity log on the right panel.)

---

## KRpanoCode Studio (this app) section

This block shows the **app version** (e.g. `v0.2.8`) in a small badge and
lets you:

- **Check for updates** — manually poll GitHub for a new release of the
  desktop app. When a new version is released, a banner appears **at the top
  of the window** automatically; you don't need to check manually in
  normal use.
- **Update to <version>** — appears only when an update is available.
  Downloads and installs it; the update applies on next restart.
- **View log** — opens the debug log file in your file manager. See
  [Troubleshooting](troubleshooting.md) for what's in it and where.

!!! note "Dev builds can't self-update"
    "Check for updates" works **only** in the packaged, installed version of
    the app. If you're running a dev build (e.g. via `npm run dev`), clicking
    it just shows an info toast. This is by design — it prevents
    accidentally reverting your dev build to the release channel.

---

## KRpanoCode CLI (the engine) section

This block shows the **CLI version** (the bundled `krpanocode.phar`) in a
small badge and lets you:

- **Active backend** — a small panel showing the actual command the app
  would run right now, e.g. `/usr/bin/php /path/to/krpanocode.phar ...`. If
  the app is using a **mock** backend (no real PHAR available), a small
  amber "Mock backend" notice appears. A Copy button copies the full command
  for debugging.
- **Version picker** — choose between `latest` or a specific released version
  from the drop-down.
- **Update to latest** / **Install v<X>** — replaces the bundled PHAR
  in place with the chosen release from the
  [releases repo](https://github.com/iceman1010/krpanocode-releases/releases).
- **Check for updates** — compares your installed CLI version with the latest
  release and toasts the result.

The installed PHAR lives in
`~/.config/krpanocode-studio/krpanocode.phar` (Linux; platform equivalent
elsewhere), separate from the bundled one — the app copies the chosen
release there during install.

---

## What's where at a glance

| Thing | File / Folder |
|-------|---------------|
| API key + CLI default model | `~/.krpanocode/.env` |
| Backup retention (pruning)   | also in `~/.krpanocode/.env` |
| App preferences              | `~/.config/krpanocode-studio/preferences.json` (Linux; platform-equivalent elsewhere) |
| CLI idle timeout             | app preference (`cliIdleTimeoutMs`) |
| Selected model               | app preference (`selectedModel`) |
| Debug log                    | `~/.config/krpanocode-studio/studio.log` (Linux; platform-equivalent elsewhere) |
| Tour backups                 | `<tour-folder>/.krpanocode-backup/` |
| Installed PHAR               | `~/.config/krpanocode-studio/krpanocode.phar` (Linux; platform-equivalent elsewhere) |

Click **Done** at the bottom of the modal to close it. Changes have already
been saved.
