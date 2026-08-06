# KRpanoCode Studio

KRpanoCode Studio is a desktop app that edits your **KRPano virtual tour** XML
files for you, using a large-language model. Instead of hunting through
`tour.xml`, `skin.xml`, `panel.xml` and dozens of `<include>` files by hand,
you describe what you want in plain English and the app — with the help of an
AI model — reads your tour, makes the edits, and writes the files back. You get
a clear **diff** of every change and can keep or undo each one.

This manual is for the desktop app. A separate CLI (`krpanocode.phar`) does
the actual file editing behind the scenes; you rarely need to think about it,
but the "[What happens inside](what-happens-inside.md)" page explains it if
you're curious.

---

## In short

- Describe what you want to change → the app edits your tour XML.
- Every edit is backed up first, so **Undo** always gets you back.
- You see a line-by-line **diff** before deciding to keep anything.
- **Clarify** mode lets the AI ask you a question before editing, for ambiguous
  instructions.
- Works with any KRPano 1.23.3 tour that has an `index.html`.

---

## Where to go next

1. **[Getting started](getting-started.md)** — install, first run, open a tour.
2. **[The interface](the-interface.md)** — tour of the buttons and panels.
3. **[Editing tours](editing-tours.md)** — how to write a good prompt, review a
   diff, keep or undo.
4. **[Clarify](clarify.md)** — when and why to let the AI ask back.
5. **[What happens inside](what-happens-inside.md)** — backups, the PHAR,
   NDJSON, retry — the under-the-hood picture, kept light.
6. **[Settings](settings.md)** — API key, model, backups, idle timeout,
   updates.
7. **[Troubleshooting](troubleshooting.md)** — common errors and where the
   log file is.
8. **[FAQ](faq.md)** — short answers to short questions.

---

*This manual is the single source of truth for user-facing help. It is
published both inside the app and on the project's GitHub Pages site from the
same Markdown files.*
