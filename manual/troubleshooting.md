# Troubleshooting

A short list of the most common hiccups and how to read your way out of
them. If you can't find your problem here, open the **Conversation log** and
**View log** (in Settings) to gather details for a support request.

---

## "No API key" badge in the top bar

The app hasn't been configured with an API key yet.

**Fix:** Open Settings (gear icon), paste your `sk-...` key, click **Verify**.
On success the badge becomes the normal model dropdown.

---

## "Models unavailable" in the top bar

The model list couldn't be loaded from the proxy. Possible causes:

- **Wrong API key** — the key was rejected (401). Re-verify in Settings.
- **Proxy unreachable** — check your network / VPN / proxy URL is reachable
  from your machine.
- **Proxy down** — your LiteLLM proxy may be offline. Check with whoever
  administers the proxy.

The dropdown shows the message in red as a clue. Re-Verify in Settings
retries the fetch.

---

## Rate-limit banner (429)

If the LLM proxy returns a 429 ("Too Many Requests"), you'll see a
**Rate-limit banner** instead of a plain error: it carries a countdown timer
and a **Retry** button.

- The **countdown** is based on the `Retry-After` value the proxy sent
  (seconds until the rate limit window resets).
- The **Retry** button resends the last prompt — you don't have to retype it.
- The CLI doesn't retry 429s itself (it respects the proxy's reset hint);
  it restores from the backup and emits an error so you can decide when to
  retry.

What to do: wait for the countdown to reach zero, then click Retry. If it
happens often, talk to your proxy administrator about raising your tier.

---

## "Network hiccup" blue banner (Resume edit)

When the API proxy times out waiting for the upstream model — usually an HTTP
**524**, but also any 5xx gateway response — the CLI's automatic retry policy
exhausts its attempts and the edit is rolled back to the last clean backup.

The app then shows a **blue "Network hiccup blocked the edit" banner** with a
**Resume edit** button. Clicking it re-runs the same prompt (and your
clarification answer, if any) from the clean backup. No state is lost: you
don't have to retype the prompt or re-do the clarify round-trip.

- **Resume vs. Retry (rate limit)**: the rate-limit banner is for 429 with a
  countdown; the Resume banner is for 5xx with no countdown. They never both
  appear at the same time.
- **Files on disk are safe** — when the failure happened, the CLI silently
  restored the backup, so nothing is half-applied.
- **If the upstream is still down**, Resume will fail the same way. Wait a
  minute and try again. The CLI's own auto-retry already failed twice before
  this banner appears, so a Resume on a healthy network is the right move.
- **Dismiss the banner** with the × button — the Resume is then gone for that
  run (you can still Undo from the diff review if any diffs landed).

The full HTTP response headers (`cf-ray`, `server`, `retry-after`,
`cf-cache-status`, etc.) from the failing request are recorded in the app log
file — see "Where is the log file?" below. Include those when reporting a
recurring gateway issue to your proxy provider.

---

## "PHAR exited with code 1" and no stderr

The CLI failed but didn't print an error message either. Most often:

- **API key rejected** — re-Verify in Settings.
- **Tour folder lacks editable files** — there's no `index.html`, or the
  files are all locked/binary.
- **Disk full** — the backup couldn't be written.
- **PHAR corruption** — the installed PHAR is incomplete or corrupted.

**Where to look:** the log file (Settings → **View log**, or open
`~/.config/krpanocode-studio/studio.log` directly). The Status column
(`[spawn]`, `[backend]`) often has more detail than the toast.

---

## Idle timeout dialog appears mid-edit

This means the CLI went silent for longer than your configured **CLI idle
timeout** (default 5 minutes). See [What happens inside](what-happens-inside.md)
for what it means. Two choices:

- **Abort** — kills the run. The status returns to `idle`. If any files were
  already written, **Undo** restores from the backup.
- **Extend** — gives the run another timeout period of silence before asking
  again.

If it happens often on legitimately long edits, raise the timeout in
Settings.

---

## Preview didn't reload after an edit

The preview normally refreshes automatically once the edit finishes. If it
doesn't:

- Click the **circular arrow** (Reload) in the top-right of the preview panel.
- Click **Open in browser** to launch the tour in your system browser —
  useful if the embedded view has a stale cache.
- The reload is driven by a file-system watcher on the tour folder; if the
  tour is on a network mount or a case-sensitive fsnotify edge case, the
  watcher can miss the change.

---

## Can't open a tour folder

Symptoms: toast error like *"No index.html found"* or the folder picker
returns nothing.

- Confirm the folder actually contains an `index.html`.
- Make sure you have **read permission** on the folder and all files inside.
- If the folder is on a network drive, copy it locally first — the file
  watcher and the embedded HTTP server expect a local path.

---

## App starts but nothing renders / preview is blank

- Reload the preview (circular arrow).
- Check that the tour's `index.html` doesn't hard-require a server-side
  backend (PHP, etc.); krpano tours are static and should load directly.
- Look at the log file — the embedded preview server may have failed to
  bind. Restart the app if the port is already in use by something else.

---

## Where is the log file?

The app writes a single log file per session (overwritten on each launch).

| OS | Path |
|----|------|
| Linux   | `~/.config/krpanocode-studio/studio.log` |
| macOS   | `~/Library/Application Support/krpanocode-studio/studio.log` |
| Windows | `%APPDATA%\krpanocode-studio\studio.log` |

You can reach it from Settings → **View log**, or open it directly. Each line
is prefixed with `[INFO]` or `[ERROR]` and the most common module tags are:

- `[app]` — lifecycle events (startup, shutdown)
- `[backend]` — how the CLI is configured (PHP path, PHAR path, mock)
- `[spawn]` — the CLI process spawning and exit
- `[phar]` — PHAR file management
- `[watcher]` — file-system watcher events
- `[update]` — auto-update process

A quick way to find errors:

```bash
grep "ERROR" ~/.config/krpanocode-studio/studio.log
```

---

## When to send a bug report

If a problem persists after working through this page, please report it
with:

1. The **app version** and **CLI version** (both in Settings, in the top
   right of each block).
2. The **mock/real backend** status of the active backend panel (Settings →
   "Active backend").
3. A **copy of the Conversation log** for the failing run (open the modal,
   click **Copy transcript**, paste into the report).
4. A **copy of the log file** (or the relevant lines around the error).
