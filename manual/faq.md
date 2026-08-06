# Frequently asked questions

Short answers to short questions.

---

### Can I still edit the XML by hand?

Yes. The app is just a front-end — the CLI edits the same XML files you'd
edit yourself. If you prefer to tweak something manually in your text editor,
just do it; the app doesn't lock the files. The next **Send** re-reads them.

If you have an unrelated manual edit sitting on disk when you hit **Send**,
it'll be picked up as part of the file state, edited by the AI, and included
in the diff. Up to you to decide whether that's what you wanted.

---

### Does the AI see my whole tour?

It sees the **editable files** in the tour folder — the ones listed as
`editable` in the Files summary. Locked/binary files (like `blend.xml`) are
not sent to the model. Files outside the tour folder are never read.

The PHAR also gives the AI the relevant KRPano documentation for your prompt,
pulled from the 27 curated KRPano 1.23.3 docs bundled with the CLI. That's
the `docsearch` row you see in the Activity log.

---

### Where is my API key stored?

In a small file at `~/.krpanocode/.env` (Linux/macOS) or
`%USERPROFILE%\.krpanocode\.env` (Windows). It's readable by you only. The
file is created by the CLI during the **Verify** step in Settings. You can
edit it by hand if you prefer, though Setup is the safer path.

The app itself also remembers your **selected model** in its own preferences
file under `~/.config/krpanocode-studio/` (Linux; platform-equivalent
elsewhere), but the actual key lives only in the `.env`.

---

### Can I use a model that's not in the dropdown?

No — the dropdown lists every model your LiteLLM proxy offers. To use a new
model, your proxy administrator needs to add it to the proxy, then click
**Check for updates** in Settings (or just restart the app) to refresh the
list.

---

### What happens if the network drops mid-edit?

For transient errors (rate limits, gateway timeouts, brief blips), the CLI
retries automatically — you'll see a small `retry` note in the Activity log
and the run just takes a bit longer. Only real, persistent failures reach
the error banner.

In all error cases the CLI rolls back to the backup it made before the edit,
so your files are still in their pre-edit state. You can always **Undo**
manually as well if anything looks off.

---

### How do I undo an edit from a few runs ago?

There's no multi-undo in the UI — **Undo** always reverts the **latest**
edit, because each new edit replaces the previous backup. If you need to go
back further, look in `<tour-folder>/.krpanocode-backup/` — there are up to N
folders (one per recent edit, default 10). Copy the files out of the
timestamped folder you want and paste them back into the tour folder
manually.

Be aware that the current run's Undo target is whatever's in the latest
folder; restoring an older one manually will, naturally, lose anything in the
newer folders if you delete them.

---

### Why are some files in the Files summary marked "locked"?

That's the CLI's classification. Files like `blend.xml` are encrypted
binary; the CLI refuses to send them to the AI and refuses to write them
back. They're shown for completeness so you can see what's there. You can't
make the app edit them — the model never sees their contents.

---

### Does the app phone home? Is anything telemetry'd?

No telemetry. The app talks only to:

1. Your **LiteLLM proxy** (for AI completions — the prompt + file contents
   go there).
2. **GitHub releases** (to check for updates of the app and the CLI; no
   identifying information is sent).
3. An **embedded local web server** reachable only from your machine, which
   serves the tour preview.

No analytics, no crash reporting. The log file lives on your disk only.

---

### Can I run multiple edit runs at once?

No — the app is single-track. While a run is working (`working` state), the
prompt box is disabled and **Stop** appears instead. Wait for the run to
finish, or click **Stop** to abort, before sending the next prompt.

You can, however, **open a tour folder in parallel in your text editor** to
peek at the files while a run is in progress — the AI's `write_file`s happen
live on disk, so you can watch the changes happen.

---

### Is there a CLI version of this for scripting?

Yes — the same PHAR that the app drives can be used directly from a shell.
See the CLI project's own README at
[github.com/iceman1010/KRPano_LLM_code](https://github.com/iceman1010/KRPano_LLM_code)
for the full CLI reference (`-p`, `--clarify`, `--json`, `--restore`, etc.).
This manual covers only the desktop app.

---

*Have a question that's not answered here? See
[Troubleshooting](troubleshooting.md) for where to dig, or file an issue on
[the UI repo](https://github.com/iceman1010/KRpanoCodeStudio/issues).*
