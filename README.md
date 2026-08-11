# KRpanoCode Studio

KRpanoCode Studio is an Electron desktop app (TypeScript + React + Vite) that
provides a GUI front-end to the [`krpanocode.phar`](https://github.com/iceman1010/KRPano_LLM_code)
CLI. It edits KRPano virtual tour XML files via an LLM using NDJSON streaming —
prompt-driven edits, live diff review with click-to-edit hunks, clarify
dialogues, validation retries with user gating, and a conversation log with
per-phase token-usage breakdown.

> Looking for install binaries? See the
> [Latest Release](https://github.com/iceman1010/KRPanoCodeStudio/releases/latest)
> page — it has download links and per-OS install instructions (including
> how to bypass the unsigned-app warnings on macOS and Windows).

---

## Requirements (for development)

- Node.js 22+
- npm (with `package-lock.json` committed)
- PHP 8.2+ **OR** the bundled PHP fallback (CI ships its own)
- A seeded `krpanocode.phar` in `resources/` **OR** let `npm run dev` fall
  back to the bundled mock backend (see `docs/MOCKUP-TESTS.md`)

The app bundles PHP + `krpanocode.phar` at build time via `extraResources`,
so end users never need PHP/Composer. Developers can use the mock backend
to avoid API costs.

---

## Quick Start (development)

```bash
# Install dependencies
npm ci

# Run dev mode (auto-falls back to mock backend if no PHP/PHAR found)
npm run dev

# Force the mock backend (no API costs)
KRPANOCODE_DEV=1 npm run dev

# Force the real backend (requires system PHP + seeded PHAR)
KRPANOCODE_DEV_MOCK="" npm run dev
```

The dev server runs Vite + Electron concurrently. The mock emulates the PHAR
NDJSON contract so you can develop the UI without API spend.

---

## Architecture

```
                          bridge (preload.cjs)
  Renderer (React 19)  ───────────────────────  Main (Node, CJS)
   src/App.tsx              ipcRenderer.invoke    main/index.cjs
   src/stores/appStore.ts   ───────────────────►  IPC handlers
   src/components/*         ◄──────────────────  webContents.send
                            ipcRenderer.on         (NDJSON events)
                                   │
                                   ▼
                          spawn krpanocode.phar --json
                          stream NDJSON events → renderer
```

- **Main process**: `main/index.cjs` (CJS) — IPC handlers, PHAR spawning,
  logging, preferences, watcher, preview HTTP server, power-monitor resume.
- **Preload bridge**: `main/preload.cjs` — `contextBridge` exposes
  `electronAPI.invoke(cmd, ...args)` and `electronAPI.on(event, cb)`.
- **Renderer**: `src/App.tsx` → TopBar, Preview, right-panel (Diff viewer,
  Activity log, Action bar), ConversationLog, modals.
- **State**: `src/stores/appStore.ts` (Zustand) — single source of truth for
  tour state, diffs, usage events, conversation turns.
- **UI primitives**: `src/components/ui/` (Radix-based) + Tailwind CSS 4.

### IPC Handler Catalog (main/index.cjs)

| Handler        | Purpose                                            |
|----------------|----------------------------------------------------|
| `open_tour`    | Open tour folder, start watcher, seed preview      |
| `send_prompt`  | Spawn PHAR with `--json` + prompt, stream NDJSON    |
| `clarify_answer` | Pipe `--clarify` answer stdin into running PHAR   |
| `undo`         | Run `--restore` (single last backup)               |
| `list_models`  | Fetch model list from LiteLLM proxy                 |
| `setup`        | Verify API key + write `.env` for PHAR backend      |
| `read_file`     | Read a file inside the open tour (diff-hunk editor)|
| `write_file`    | Atomic write to a file inside the open tour        |
| `phar_version` / `latest_release` / `self_update` | PHAR versioning |
| `get_preferences` / `save_preferences`              | User prefs       |

Full handler table in `AGENTS.md`. The authoritative NDJSON contract lives
in the sister project: [`KRPano_LLM_code/PLAN-JSON-MODE.md`](https://github.com/iceman1010/KRPano_LLM_code/blob/main/PLAN-JSON-MODE.md).

---

## Building & Packaging

```bash
# Typecheck + vite build (verification)
npm run build

# Local packaging (no publish)
npm run package:linux
npm run package:mac -- --x64 --arm64
npm run package:win
```

The full CI/CD pipeline is documented in [`docs/CICD.md`](docs/CICD.md). It
runs on version bumps in `package.json` and produces:

- Linux: `.AppImage`, `.deb`
- macOS: `.dmg` (x64 + arm64 universal build)
- Windows: NSIS `.exe`

All builds are currently **unsigned**. See the
[latest release page](https://github.com/iceman1010/KRPanoCodeStudio/releases/latest)
for install/bypass instructions per OS.

---

## Documentation

### `manual/` (end-user, single source of truth)

Shipped in-app via the Help modal (Vite-bundled Markdown) and published to
GitHub Pages via `mkdocs.yml`. **Edit `manual/*.md` only** — do not duplicate
help text in source code or toasts.

### `docs/` (developer / backstage)

| File | What's in it |
|------|--------------|
| `docs/CICD.md`          | Release pipeline: version-gated trigger, build matrix, artifact upload |
| `docs/LOGGING.md`       | Log file location, format, modules, troubleshooting |
| `docs/MOCKUP-TESTS.md`  | Mock backend setup, NDJSON emulation, dev workflow |
| `docs/SELF-UPDATE.md`   | electron-updater auto-update mechanism |

### Sister project

The PHAR backend is developed separately at
<https://github.com/iceman1010/KRPano_LLM_code>. When changes touch the NDJSON
contract or event handling, consult `PLAN-JSON-MODE.md` there first.

---

## License

See the [`LICENSE`](LICENSE) file.
